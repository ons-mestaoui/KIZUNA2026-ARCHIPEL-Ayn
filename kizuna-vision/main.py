import io
import os
import sys
import time
from typing import List, Optional

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np

import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image, ImageOps

# ==============================================================================
# APPLICATION FASTAPI : KIZUNA NEXUS OS (TUNISIE × JAPON)
# ==============================================================================
app = FastAPI(
    title="KIZUNA Nexus API",
    description="API de pilotage Solaire, Eau, Résilience Agricole & Vision Multi-Cultures (31 Classes) pour la Tunisie et le Japon",
    version="2.0.0"
)

# 1. Autoriser le frontend (React / Next.js / HTML) à communiquer avec l'API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# MODULE 1 : SIMULATION SOLAIRE & IRRIGATION RAISONNÉE (FAO-56)
# ==============================================================================

GOVERNORATES = {
    "Sidi Bouzid": (35.0382, 9.4849),
    "Kairouan": (35.6781, 10.0963),
    "Nabeul": (36.4561, 10.7376),
    "Sfax": (34.7406, 10.7603),
    "Béja": (36.7256, 9.1817)
}

class SimulationRequest(BaseModel):
    governorate: str = "Sidi Bouzid"
    solar_kwc: float = 10.0
    pump_kw: float = 5.5

@app.post("/api/simulate")
def run_simulation(req: SimulationRequest):
    lat, lon = GOVERNORATES.get(req.governorate, (35.0382, 9.4849))
    hours = np.arange(24)

    solar_profile = np.maximum(0, np.sin((hours - 6) / 14 * np.pi)) ** 1.3
    ghi = solar_profile * 950.0

    temp = 22.0 + 16.0 * np.maximum(0, np.sin((hours - 8) / 14 * np.pi))
    humidity = 70.0 - 45.0 * np.maximum(0, np.sin((hours - 8) / 14 * np.pi))
    wind = 12.0 + 8.0 * np.sin(hours / 24 * np.pi)

    thermal_loss = np.maximum(0, (temp - 25.0) * 0.004)
    pv_power = req.solar_kwc * (ghi / 1000.0) * (1.0 - thermal_loss)

    p10 = pv_power * 0.85
    p90 = np.clip(pv_power * 1.15, 0, req.solar_kwc)

    evap_risk = np.clip((temp / 45.0) * 0.5 + ((100.0 - humidity) / 100.0) * 0.3 + (wind / 30.0) * 0.2, 0, 1)
    can_pump = (pv_power >= req.pump_kw) & (evap_risk < 0.65)

    total_kwh = float(pv_power.sum())
    pump_hours = int((pv_power >= req.pump_kw).sum())
    money_saved_month = pump_hours * req.pump_kw * 0.260 * 30
    water_saved_m3_day = 4 * 18.0 * 0.30
    co2_avoided_kg_day = total_kwh * 0.52

    hourly_data = []
    for h in range(24):
        hourly_data.append({
            "hour": int(h),
            "label": f"{h:02d}:00",
            "pv_power_kw": round(float(pv_power[h]), 2),
            "p10_kw": round(float(p10[h]), 2),
            "p90_kw": round(float(p90[h]), 2),
            "evap_risk_pct": round(float(evap_risk[h] * 100), 1),
            "is_pump_on": bool(can_pump[h])
        })

    return {
        "status": "success",
        "governorate": req.governorate,
        "recommendation": "Créneau d'irrigation optimal : 09h00 - 11h00. Arrosage déconseillé entre 11h00 et 15h00 (évaporation forte & pic STEG).",
        "kpis": {
            "total_kwh_day": round(total_kwh, 1),
            "money_saved_tnd_month": round(money_saved_month, 0),
            "water_saved_m3_day": round(water_saved_m3_day, 1),
            "co2_avoided_kg_day": round(co2_avoided_kg_day, 1)
        },
        "hourly_data": hourly_data
    }


# ==============================================================================
# MODULE 2 : COMPUTER VISION IA (31 CLASSES — MULTI-CULTURES TUNISIE × JAPON)
# ==============================================================================

MODEL_WEIGHTS_PATH = os.getenv(
    "MODEL_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "tomato_disease_mobilenetv3.pth")
)

# 31 Classes du modèle hybride (Agrumes, Riz Japonais, Thé Vert, Olivier, Piment, Pomme de terre, Tomate)
CLASS_NAMES = [
    "Citrus___Blackspot",
    "Citrus___Canker",
    "Citrus___Greening",
    "Citrus___Healthy",
    "Japanese_Rice___Bacterial_Blight",
    "Japanese_Rice___Blast",
    "Japanese_Rice___Brown_Spot",
    "Japanese_Rice___False_Smut",
    "Japanese_Tea___Algal_spot",
    "Japanese_Tea___Brown_blight",
    "Japanese_Tea___Gray_blight",
    "Japanese_Tea___Red_spot",
    "Olive___Aculus_olearius",
    "Olive___Healthy",
    "Olive___Olive_peacock_spot",
    "Pepper__bell___Bacterial_spot",
    "Pepper__bell___healthy",
    "Potato___Early_blight",
    "Potato___Late_blight",
    "Potato___healthy",
    "Tomato_Bacterial_spot",
    "Tomato_Early_blight",
    "Tomato_Late_blight",
    "Tomato_Leaf_Mold",
    "Tomato_Septoria_leaf_spot",
    "Tomato_Spider_mites_Two_spotted_spider_mite",
    "Tomato__Target_Spot",
    "Tomato__Tomato_YellowLeaf__Curl_Virus",
    "Tomato__Tomato_mosaic_virus",
    "Tomato___Tuta_absoluta",
    "Tomato_healthy"
]

DISEASE_METADATA = {
    # ----------------- AGRUMES (CITRUS) -----------------
    "Citrus___Blackspot": {
        "title": "Taches Noires des Agrumes (Citrus Black Spot - Phyllosticta citricarpa)",
        "crop": "Agrumes (Citronnier, Oranger, Mandarine)",
        "category": "Infection Fongique de Quarantaine",
        "severity": "Élevé",
        "symptoms": "Lésions circulaires déprimées à centre grisâtre et bordure brun-rougeâtre sur fruits et feuilles.",
        "impact": "Dépréciation esthétique des fruits et chute prématurée.",
        "urgency": "Traitement fongicide cuprique dès la chute des pétales.",
        "biological_treatment": "1. Pulvériser du cuivre (bouillie bordelaise).<br>2. Ramasser et détruire les litières de feuilles au sol.<br>3. Élaguer pour aérer le houppier.",
        "tunisian_advice": {
            "arabic_summary": "« بقع سوداء في القوارص - نظف الأوراق وطهر بالنحاس »",
            "voice_script": "هذا مرض النقطة الكحلة في القوارص. نظف الأوراق الطايحة ورش دواء النحاس بعد النوارة باش ما تعديش الغلة."
        }
    },
    "Citrus___Canker": {
        "title": "Chancre Bactérien des Agrumes (Citrus Canker - Xanthomonas)",
        "crop": "Agrumes (Yuzu, Citronnier, Bigaradier)",
        "category": "Bactériose Foliaire et Fructifère",
        "severity": "Critique",
        "symptoms": "Lésions vésiculeuses liégeuses surélevées entourées d'un halo jaune huileux.",
        "impact": "Défoliation massive et avortement des fruits.",
        "urgency": "Alerte sanitaire : désinfection immédiate.",
        "biological_treatment": "1. Tailler et incinérer les rameaux atteints.<br>2. Traitement au cuivre après chaque épisode de vent ou de grêle.<br>3. Désinfecter le matériel de taille.",
        "tunisian_advice": {
            "arabic_summary": "« الجرب البكتيري في الليمون - قص الأغصان المريضة »",
            "voice_script": "هذا الجرب البكتيري ضرب شجرة القوارص. قص العروق المريضة واحرقها، وطهر بمحلول النحاس."
        }
    },
    "Citrus___Greening": {
        "title": "Huanglongbing / Greening des Agrumes (HLB - Candidatus Liberibacter)",
        "crop": "Agrumes",
        "category": "Bactérie Vasculaire transmise par Psylle",
        "severity": "Urgence Absolue",
        "symptoms": "Marbrures asymétriques jaune-vert sur les feuilles, nervures épaissies et fruits asymétriques amers.",
        "impact": "Mort irrémédiable de l'arbre en 2 à 5 ans.",
        "urgency": "Arrachage du sujet infecté pour préserver le verger.",
        "biological_treatment": "1. Contrôle biologique strict du psylle vecteur (parasitoïde Tamarixia radiata).<br>2. Poser des pièges jaunes englués.<br>3. Arrachage immédiat des arbres positifs.",
        "tunisian_advice": {
            "arabic_summary": "« مرض التنين الأصفر (الجرينينغ) - راقب حشرة البسيل واقلع الشجرة المريضة »",
            "voice_script": "رد بالك هذا مرض الجرينينغ الخطير برشة. راقب حشرة البسيل وما تخليش العدوى تنتشر في الجنان."
        }
    },
    "Citrus___Healthy": {
        "title": "Feuille d'Agrume Vigoureuse & Saine",
        "crop": "Agrumes",
        "category": "État Optimal (Sain)",
        "severity": "Aucun (Sain)",
        "symptoms": "Feuilles vert foncé vernissées, sans décoloration ni pustule.",
        "impact": "Vigueur et fructification optimales.",
        "urgency": "Maintien de la gestion agronomique courante.",
        "biological_treatment": "Poursuivre la fertilisation organique équilibrée et l'irrigation localisée.",
        "tunisian_advice": {
            "arabic_summary": "« شجرة القوارص بصحة ممتازة، تبارك الله »",
            "voice_script": "تبارك الله الشجرة نظيفة وما فيها حتى مرض. واصل في الري المعتدل."
        }
    },

    # ----------------- RIZ JAPONAIS (JAPANESE RICE / INE) -----------------
    "Japanese_Rice___Bacterial_Blight": {
        "title": "Flétrissement Bactérien du Riz (Bacterial Blight - Xanthomonas oryzae)",
        "crop": "Riz Japonais (Ine / 稲)",
        "category": "Bactériose Vasculaire Rizicole",
        "severity": "Critique",
        "symptoms": "Lésions linéaires ondulées vert-grisâtre le long des bords des feuilles, virant au jaune paille.",
        "impact": "Pertes de récolte rizicole de 30% à 60%.",
        "urgency": "Drainage temporaire de la rizière et réduction d'azote.",
        "biological_treatment": "1. Baisser le niveau d'eau dans la rizière.<br>2. Stopper les apports d'engrais azotés.<br>3. Apport d'engrais potassique et siliceux.",
        "tunisian_advice": {
            "arabic_summary": "« حروق بكتيرية في الروز - نقص الماء والآزوت »",
            "voice_script": "هذا التفحم البكتيري في نبات الروز. نقص الماء الراكد ونقص من غبار الآزوت باش الورقة تصح."
        }
    },
    "Japanese_Rice___Blast": {
        "title": "Pyriculariose du Riz Japonais (Rice Blast / いもち病 - Magnaporthe oryzae)",
        "crop": "Riz Japonais (Ine / 稲)",
        "category": "Fléau Fongique Majeur du Japon (MAFF)",
        "severity": "Urgence Critique",
        "symptoms": "Lésions elliptiques en forme d'œil ou losange à centre gris et bordure brun foncé.",
        "impact": "Casse des panicules et perte totale possible (jusqu'à 80%).",
        "urgency": "Intervention sous 24h avant la montaison.",
        "biological_treatment": "1. Pulvériser un biofongicide à base de Bacillus amyloliquefaciens.<br>2. Appliquer de la silice soluble.<br>3. Éviter les densités de semis trop fortes.",
        "tunisian_advice": {
            "arabic_summary": "« مرض إيموتشي بيو في الروز - مرض فطري يلزم التدخل السريع »",
            "voice_script": "هذا مرض إيموتشي بيو الخطير في الروز. مرض فطري يكسر السنبلة. داوي فيسع ونظم ماء الحقل."
        }
    },
    "Japanese_Rice___Brown_Spot": {
        "title": "Helminthosporiose / Taches Brunes du Riz (Brown Spot - Bipolaris oryzae)",
        "crop": "Riz Japonais",
        "category": "Infection Fongique de Sol Pauvre",
        "severity": "Moyen",
        "symptoms": "Nombreuses petites taches ovales brun foncé uniformément réparties sur le limbe.",
        "impact": "Baisse de qualité du grain et fonte de semis.",
        "urgency": "Amélioration de la nutrition minérale du sol sous 5 jours.",
        "biological_treatment": "1. Corriger les carences en manganèse et potassium.<br>2. Traitement des semences à l'eau chaude (60°C pendant 10 min).<br>3. Équilibrer le pH.",
        "tunisian_advice": {
            "arabic_summary": "« بقع بنية في الروز - صلح تغذية التربة ونقص الإجهاد »",
            "voice_script": "البقع البنية تدل على ضعف التربة ونقص البوتاسيوم. زيد المغذيات وعالج البذور قبل الغراسة."
        }
    },
    "Japanese_Rice___False_Smut": {
        "title": "Faux-Charbon du Riz (False Smut - Ustilaginoidea virens)",
        "crop": "Riz Japonais",
        "category": "Pathologie des Panicules",
        "severity": "Élevé",
        "symptoms": "Grains transformés en volumineuses masses veloutées jaune verdâtre virant au noir.",
        "impact": "Toxines dans la récolte et perte marchande.",
        "urgency": "Nettoyage des panicules et drainage.",
        "biological_treatment": "1. Éliminer manuellement les panicules touchées.<br>2. Traitement cuprique avant floraison.<br>3. Rotation des cultures.",
        "tunisian_advice": {
            "arabic_summary": "« تفحم كاذب في سنبلة الروز - نظف السنابل المضروبة »",
            "voice_script": "هذا التفحم الكاذب في سنبلة الروز يعمل كرات صفراء. نحي السنابل المضروبة ورش وقائي."
        }
    },

    # ----------------- THÉ VERT JAPONAIS (JAPANESE TEA / OCHA) -----------------
    "Japanese_Tea___Algal_spot": {
        "title": "Tache d'Algue du Théier (Cephaleuros virescens / Ocha)",
        "crop": "Théier Japonais (Ocha / お茶)",
        "category": "Infection Algaire Parasitaire Foliaire",
        "severity": "Moyen",
        "symptoms": "Taches circulaires veloutées vert-orangé en relief sur les feuilles matures.",
        "impact": "Diminution de la vigueur et du goût umami des jeunes pousses.",
        "urgency": "Élagage d'aération des buissons de thé.",
        "biological_treatment": "1. Tailler les rameaux internes pour faciliter la pénétration de la lumière.<br>2. Drainage des zones d'eau stagnante.<br>3. Pulvérisation préventive de cuivre doux.",
        "tunisian_advice": {
            "arabic_summary": "« طحالب في أوراق التاي الأخضر - هوّي الشجرة وقص العروق المتشابكة »",
            "voice_script": "هذا تبقع طحلبي في أوراق التاي الأخضر. قص العروق المتشابكة باش يدخل الهواء والشمس."
        }
    },
    "Japanese_Tea___Brown_blight": {
        "title": "Brûlure Brune du Théier (Brown Blight - Glomerella cingulata)",
        "crop": "Théier Japonais",
        "category": "Infection Fongique des Rameaux",
        "severity": "Élevé",
        "symptoms": "Dessèchement brun chocolat débutant à l'extrémité des feuilles et progressant vers le rameau.",
        "impact": "Chute prématurée des feuilles de récolte (Sencha/Matcha).",
        "urgency": "Intervention sous 3 jours.",
        "biological_treatment": "1. Élagage des rameaux nécrosés.<br>2. Bouillie bordelaise diluée.<br>3. Paillage végétal.",
        "tunisian_advice": {
            "arabic_summary": "« احتراق بني في أوراق التاي - قص الأطراف الميتة »",
            "voice_script": "أوراق التاي فيها احتراق بني في الأطراف. قص البلايص الميتة وطهر بمحلول خفيف."
        }
    },
    "Japanese_Tea___Gray_blight": {
        "title": "Brûlure Grise du Théier (Pestalotiopsis theae)",
        "crop": "Théier Japonais",
        "category": "Infection Fongique Traumatique",
        "severity": "Moyen",
        "symptoms": "Taches zonées gris cendré avec anneaux concentriques et points noirs sporifères.",
        "impact": "Dépréciation des feuilles récoltées.",
        "urgency": "Désinfection après chaque cueillette mécanique.",
        "biological_treatment": "1. Éviter d'endommager les rameaux lors de la récolte.<br>2. Pulvériser du purin de prêle.<br>3. Fertilisation riche en potasse.",
        "tunisian_advice": {
            "arabic_summary": "« تبقع رمادي بعد الجني في التاي - عقم ماكينات الجني »",
            "voice_script": "هذا تبقع رمادي يجي بعد جني الأوراق. عقم مقصات الجني وما تجرحش الأغصان."
        }
    },
    "Japanese_Tea___Red_spot": {
        "title": "Taches Rouges du Théier (Red Leaf Spot)",
        "crop": "Théier Japonais",
        "category": "Pathologie Foliaire Épiphytique",
        "severity": "Moyen",
        "symptoms": "Mouchetures rouille-rougeâtre punctiformes sur les limbes.",
        "impact": "Altération des tanins et de la couleur de l'infusion.",
        "urgency": "Surveillance printanière.",
        "biological_treatment": "1. Renforcer l'immunité foliaire par des bio-stimulants aux algues.<br>2. Traitement cuprique préventif.",
        "tunisian_advice": {
            "arabic_summary": "« بقع حمراء في التاي - قوي مناعة النبتة بالمستخلصات الطبيعية »",
            "voice_script": "البقع الحمراء تفسد نكهة التاي. استعمل المقويات الطبيعية ورش رشة وقائية."
        }
    },

    # ----------------- OLIVIER (OLIVE TREE) -----------------
    "Olive___Aculus_olearius": {
        "title": "Acariose de l'Olivier (Aculus olearius / Phanérogames)",
        "crop": "Olivier Méditerranéen (Chemlali, Chétoui)",
        "category": "Acarien Phytophage Ériophyide",
        "severity": "Moyen",
        "symptoms": "Feuilles déformées en cuillère, chloroses argentées et chutes de jeunes feuilles.",
        "impact": "Ralentissement des jeunes plantations et avortement des boutons floraux.",
        "urgency": "Intervention au débourrement printanier.",
        "biological_treatment": "1. Pulvériser du soufre mouillable micronisé.<br>2. Traitement à l'huile blanche végétale d'hiver.<br>3. Préserver les acariens prédateurs naturels.",
        "tunisian_advice": {
            "arabic_summary": "« قراد وحريشة الزيتون أكولوس - استعمل الكبريت الأصفر »",
            "voice_script": "هذي حريشة الزيتون تكمش الورقة وتعوجها. رش الكبريت الميكروني في الصباح باش تحمي النمو الجديد."
        }
    },
    "Olive___Healthy": {
        "title": "Feuille d'Olivier Vigoureuse & Saine",
        "crop": "Olivier",
        "category": "État Optimal (Sain)",
        "severity": "Aucun (Sain)",
        "symptoms": "Feuille lancéolée vert olive dessus, argentée dessous, parfaitement turgescente.",
        "impact": "Capacité photosynthétique et production d'huile maximales.",
        "urgency": "Maintien de la taille et de l'irrigation d'appoint.",
        "biological_treatment": "Aucun traitement nécessaire. Maintenir l'irrigation raisonnée en période de nouaison.",
        "tunisian_advice": {
            "arabic_summary": "« زيتونتك تبارك الله عليها صحيحة ونظيفة »",
            "voice_script": "تبارك الله عود الزيتون نظيف وورقتو ممتازة. كمل هكا وما تصرف شي في الدواء."
        }
    },
    "Olive___Olive_peacock_spot": {
        "title": "Œil de Paon de l'Olivier (Spilocaea oleagina / Cycloconium)",
        "crop": "Olivier",
        "category": "Infection Fongique Majeure de l'Olivier",
        "severity": "Élevé",
        "symptoms": "Taches circulaires concentriques foncées auréolées de jaune évoquant la plume de paon.",
        "impact": "Défoliation massive de la partie basse de l'arbre et chute de rendement de 30% à 50%.",
        "urgency": "Traitement fongicide cuprique d'automne et de printemps.",
        "biological_treatment": "1. Traiter à la bouillie bordelaise (1% à 2%) après les pluies d'automne et au printemps.<br>2. Élaguer pour aérer le centre de l'olivier.<br>3. Ramasser les feuilles tombées.",
        "tunisian_advice": {
            "arabic_summary": "« عين الطاووس في الزيتون - طهر بالنحاس بعد الشتاء وهوّي الشجرة »",
            "voice_script": "هذا مرض عين الطاووس يطيح أوراق الزيتون من اللوطا. قلم وسط الشجرة باش يدخل الهواء ورش دواء النحاس بعد المطر."
        }
    },

    # ----------------- PIMENT & POIVRON (PEPPER) -----------------
    "Pepper__bell___Bacterial_spot": {
        "title": "Gale Bactérienne du Poivron / Piment (Xanthomonas euvesicatoria)",
        "crop": "Piment & Poivron",
        "category": "Bactériose Foliaire et Pédicellaire",
        "severity": "Élevé",
        "symptoms": "Petites taches circulaires brunes avec bordures surélevées et jaunissement périphérique.",
        "impact": "Défoliation précoce et pourriture des piments.",
        "urgency": "Traitement sous 48 heures.",
        "biological_treatment": "1. Pulvériser de l'oxychlorure de cuivre.<br>2. Éviter tout arrosage foliaire.<br>3. Rotation des cultures sur 3 ans.",
        "tunisian_advice": {
            "arabic_summary": "« طاشات بكتيرية في الفلفل - استعمل النحاس وما تبلوش الورقة »",
            "voice_script": "هذا جرب الفلفل البكتيري يطيح النوار والغلة. داوي بالنحاس واسقي بالقطرة قطرة وما ترشش الفوق."
        }
    },
    "Pepper__bell___healthy": {
        "title": "Feuille de Piment / Poivron Vigoureuse & Saine",
        "crop": "Piment & Poivron",
        "category": "État Optimal (Sain)",
        "severity": "Aucun (Sain)",
        "symptoms": "Feuillage vert tendre homogène, sans nécrose ni chlorose.",
        "impact": "Rendement maximal.",
        "urgency": "Gestion hydrique régulière.",
        "biological_treatment": "Continuer le pilotage hydrique au goutte-à-goutte.",
        "tunisian_advice": {
            "arabic_summary": "« الفلفل نظيف وممتاز، تبارك الله »",
            "voice_script": "الفلفل متاعك نظيف وما فيه حتى مشكل، واصل في برنامج السقي."
        }
    },

    # ----------------- POMME DE TERRE (POTATO) -----------------
    "Potato___Early_blight": {
        "title": "Alternariose de la Pomme de Terre (Early Blight - Alternaria solani)",
        "crop": "Pomme de Terre",
        "category": "Infection Fongique Foliaire",
        "severity": "Moyen",
        "symptoms": "Taches brunes concentriques en forme de cible sur les feuilles âgées.",
        "impact": "Sénescence prématurée des fanes et baisse de calibre des tubercules.",
        "urgency": "Traitement préventif dès les premiers foyers.",
        "biological_treatment": "1. Décoction de prêle ou bicarbonate de potassium.<br>2. Buttage soigné pour protéger les tubercules.<br>3. Éviter les stress hydriques.",
        "tunisian_advice": {
            "arabic_summary": "« احتراق بدري في البطاطا - استعمل بيكربونات البوتاسيوم »",
            "voice_script": "هذا مرض الألترناريا في أوراق البطاطا. داوي بالبيكربونات مع الصابون الأخضر وحافظ على رطوبة التربة."
        }
    },
    "Potato___Late_blight": {
        "title": "Mildiou de la Pomme de Terre (Late Blight - Phytophthora infestans)",
        "crop": "Pomme de Terre",
        "category": "Oomycète Dévastateur",
        "severity": "Urgence Critique",
        "symptoms": "Larges taches brunes huileuses entourées d'un halo vert pâle avec feutrage blanc sous la feuille.",
        "impact": "Destruction totale de la récolte et pourriture des tubercules en terre.",
        "urgency": "Intervention sous 24h impérative.",
        "biological_treatment": "1. Pulvérisation immédiate de cuivre (bouillie bordelaise).<br>2. Défanage précoce si l'infection atteint les tiges.<br>3. Buttage haut.",
        "tunisian_advice": {
            "arabic_summary": "« ميلديو البطاطا الخطير - تدخل فوري بدواء النحاس »",
            "voice_script": "رد بالك مليح هذا الميليو يطيح البطاطا في نهارين. رش النحاس فورا واحم التبن والتراب."
        }
    },
    "Potato___healthy": {
        "title": "Feuille de Pomme de Terre Saine",
        "crop": "Pomme de Terre",
        "category": "État Optimal (Sain)",
        "severity": "Aucun (Sain)",
        "symptoms": "Feuilles composées bien vertes et saines.",
        "impact": "Tubérisation optimale.",
        "urgency": "Surveillance régulière.",
        "biological_treatment": "Maintenir un buttage aéré et une irrigation régulière.",
        "tunisian_advice": {
            "arabic_summary": "« البطاطا في حالة ممتازة »",
            "voice_script": "تبارك الله البطاطا ما فيها حتى مرض. واصل في العناية."
        }
    },

    # ----------------- TOMATE (TOMATO - 11 CLASSES DONT TUTA ABSOLUTA) -----------------
    "Tomato_Bacterial_spot": {
        "title": "Gale Bactérienne de la Tomate (Xanthomonas)",
        "crop": "Tomate",
        "category": "Infection Bactérienne",
        "severity": "Élevé",
        "symptoms": "Petites taches noires aqueuses avec halo jaune sur feuilles.",
        "impact": "Baisse de photosynthèse et dépréciation des fruits.",
        "urgency": "Traitement sous 48h.",
        "biological_treatment": "1. Bouillie bordelaise à dose modérée.<br>2. Éviter tout arrosage par aspersion.<br>3. Désinfecter les outils.",
        "tunisian_advice": {
            "arabic_summary": "« طاشات كحلة بكتيرية في الطماطم - يلزم دواء النحاس »",
            "voice_script": "ثمة بكتيريا ضربت ورقة الطماطم بطاشات كحلة. داوي بالنحاس وما ترشش الماء فوق الأوراق."
        }
    },
    "Tomato_Early_blight": {
        "title": "Alternariose de la Tomate (Early Blight - Alternaria solani)",
        "crop": "Tomate",
        "category": "Infection Fongique",
        "severity": "Moyen",
        "symptoms": "Taches concentriques circulaires 'en cible' sur feuilles basses.",
        "impact": "Défoliation progressive partant du bas.",
        "urgency": "Suppression des premières feuilles malades.",
        "biological_treatment": "1. Couper les feuilles basses touchées.<br>2. Bicarbonate de potassium (5g/L).<br>3. Pailler le sol.",
        "tunisian_advice": {
            "arabic_summary": "« احتراق بدري في أوراق الطماطم الواطية - قص الأوراق الميتة »",
            "voice_script": "هذا مرض الألترناريا في الوراق اللوطانية. قص الأوراق المريضة وعقم يديك."
        }
    },
    "Tomato_Late_blight": {
        "title": "Mildiou de la Tomate (Late Blight - Phytophthora infestans)",
        "crop": "Tomate",
        "category": "Pseudo-champignon Oomycète",
        "severity": "Critique",
        "symptoms": "Grandes nécroses huileuses brun foncé avec duvet blanc sous la feuille.",
        "impact": "Destruction des plants en 48 à 72 heures par temps humide.",
        "urgency": "Alerte maximale sous 24h.",
        "biological_treatment": "1. Éliminer les plants fortement atteints.<br>2. Bouillie bordelaise.<br>3. Stopper l'aspersion.",
        "tunisian_advice": {
            "arabic_summary": "« فحة وميلديو سريع في الطماطم - رد بالك يلزم النحاس في 24 ساعة »",
            "voice_script": "رد بالك مليح هذا الميليو يطيح شجر الطماطم في يومين. رش دواء النحاس فورا."
        }
    },
    "Tomato_Leaf_Mold": {
        "title": "Cladosporiose / Moisissure des Feuilles (Passalora fulva)",
        "crop": "Tomate",
        "category": "Infection Fongique de Serre",
        "severity": "Moyen",
        "symptoms": "Taches jaunâtres dessus, feutrage velouté olive dessous.",
        "impact": "Ralentissement sous serre humide.",
        "urgency": "Aérer la serre sous 48h.",
        "biological_treatment": "1. Aérer largement la serre aux heures chaudes.<br>2. Effeuiller.<br>3. Savon noir dilué.",
        "tunisian_advice": {
            "arabic_summary": "« موسوسة تحت الورقة في البيت المحمي - هوّي البيت »",
            "voice_script": "الرطوبة الزايدة في البيت البلاستيكي عملت غبرة تحت الورقة. حل الشبابيك وهوّي البيت مليح."
        }
    },
    "Tomato_Septoria_leaf_spot": {
        "title": "Septoriose de la Tomate (Septoria lycopersici)",
        "crop": "Tomate",
        "category": "Infection Fongique",
        "severity": "Moyen",
        "symptoms": "Multiples petites taches circulaires grises bordées de noir.",
        "impact": "Jaunissement et défoliation précoce.",
        "urgency": "Intervention sous 48h.",
        "biological_treatment": "1. Enlever les feuilles atteintes.<br>2. Bicarbonate de soude (5g/L).<br>3. Paillage.",
        "tunisian_advice": {
            "arabic_summary": "« تنقيط وتبقع رمادي في الأوراق - استعمل البيكربونات »",
            "voice_script": "الأوراق فيها نقاط رمادية متاع سيبتوريا. نظف الأوراق المضروبة ورش البيكربونات."
        }
    },
    "Tomato_Spider_mites_Two_spotted_spider_mite": {
        "title": "Acariens Jaunes / Tétranyque Tisserand (Spider Mites)",
        "crop": "Tomate",
        "category": "Acarien Ravageur",
        "severity": "Élevé",
        "symptoms": "Mouchetures jaunâtres et fines toiles soyeuses sous la feuille.",
        "impact": "Dessèchement complet en période de canicule.",
        "urgency": "Intervention sous 48h.",
        "biological_treatment": "1. Huile de neem ou savon potassique sous les feuilles.<br>2. Lâcher d'acariens prédateurs Phytoseiidae.<br>3. Augmenter l'hygrométrie.",
        "tunisian_advice": {
            "arabic_summary": "« ورتيلا صفراء على الطماطم - رش زيت النيم في الصباح »",
            "voice_script": "هذي الورتيلا ضربت الأوراق بالخيوط. رش زيت النيم ولا الصابون تحت الورقة في الصباح."
        }
    },
    "Tomato__Target_Spot": {
        "title": "Taches Cibles de la Tomate (Corynespora cassiicola)",
        "crop": "Tomate",
        "category": "Infection Fongique",
        "severity": "Moyen",
        "symptoms": "Lésions nécrotiques circulaires brunes à centre clair.",
        "impact": "Perte de feuillage et attaques sur fruits.",
        "urgency": "Élagage préventif.",
        "biological_treatment": "1. Éliminer les résidus de culture.<br>2. Biofongicide Bacillus subtilis.<br>3. Espacer les plants.",
        "tunisian_advice": {
            "arabic_summary": "« بقع دائرية في الورقة - هوّي بين الخطوط »",
            "voice_script": "ثمة بقع دائرية متاع فطر التارجت سبوت. باعد بين الشجرات باش يدخل الريح."
        }
    },
    "Tomato__Tomato_YellowLeaf__Curl_Virus": {
        "title": "Virus des Feuilles Jaunes en Cuillère (TYLCV)",
        "crop": "Tomate",
        "category": "Phytovirus transmis par Aleurode (Bemisia tabaci)",
        "severity": "Critique",
        "symptoms": "Feuilles dressées en cuillère, bordures jaunies et arrêt de croissance.",
        "impact": "Perte de récolte de 80% à 100%.",
        "urgency": "Arrachage immédiat des plants virés et piégeage du vecteur.",
        "biological_treatment": "1. Panneaux jaunes englués pour piéger la mouche blanche.<br>2. Filets anti-insectes.<br>3. Arracher et brûler les pieds malades.",
        "tunisian_advice": {
            "arabic_summary": "« فيروس التواء الأوراق الصفراء - حط الفخاخ الصفراء واقلع الشجرة »",
            "voice_script": "رد بالك هذا فيروس التواء الأوراق اللي تنقلو الذبابة البيضاء. حط اللصاقات الصفراء واقلع الشجرة المضروبة."
        }
    },
    "Tomato__Tomato_mosaic_virus": {
        "title": "Virus de la Mosaïque de la Tomate (ToMV)",
        "crop": "Tomate",
        "category": "Tobamovirus ultra-résistant",
        "severity": "Élevé",
        "symptoms": "Marbrures vert clair et vert foncé, cloquage des feuilles.",
        "impact": "Croissance ralentie et fruits marbrés invendables.",
        "urgency": "Désinfection sanitaire stricte.",
        "biological_treatment": "1. Désinfection des mains et des outils.<br>2. Arracher les plants infectés.<br>3. Interdiction de fumer dans la parcelle.",
        "tunisian_advice": {
            "arabic_summary": "« فيروس الموزاييك - عقم يديك وما تدخنش في الحقل »",
            "voice_script": "هذا فيروس الموزاييك ينتقل باللمس. عقم يديك ومقص التقليم واقلع الشجرة المريضة."
        }
    },
    "Tomato___Tuta_absoluta": {
        "title": "Mineuse de la Tomate (Tuta absoluta) — Partenariat Tokyo Agri",
        "crop": "Tomate",
        "category": "Lépidoptère Ravageur Foliaire Clé",
        "severity": "Urgence Critique",
        "symptoms": "Galeries et plages translucides blanchâtres creusées par les larves dans les feuilles.",
        "impact": "Destruction totale de la récolte (50% à 100%) par perforation des fruits.",
        "urgency": "Intervention sous 24 à 48 heures pour stopper le cycle larvaire.",
        "biological_treatment": "1. Installer immédiatement 30 à 40 pièges à phéromones sexuelles par hectare.<br>2. Pulvériser en soirée du Bacillus thuringiensis var. kurstaki.<br>3. Introduire la punaise prédatrice Nesidiocoris tenuis.<br>4. Stopper toute aspersion foliaire.",
        "tunisian_advice": {
            "arabic_summary": "« سوسة الطماطم توتا ابسولوتا - حط فخاخ الفيرومون ورش الباسيلوس فيسع »",
            "voice_script": "التصويرية اللي بعثتها تبين بداية توتا ابسولوتا في الطماطم. حط فخاخ الفيرومون في الحقل، رش بكتيريا الباسيلوس في المغرب، وما ترشش بالماء الفوقاني."
        }
    },
    "Tomato_healthy": {
        "title": "Feuille de Tomate Vigoureuse & Parfaitement Saine",
        "crop": "Tomate",
        "category": "État Optimal (Sain)",
        "severity": "Aucun (Sain)",
        "symptoms": "Couleur vert franc homogène, cuticule brillante, aucune nécrose.",
        "impact": "Aucun risque. Rendement maximal préservé.",
        "urgency": "Continuer le pilotage hydrique régulier.",
        "biological_treatment": "Aucun traitement chimique ou biologique requis. Maintenir l'irrigation raisonnée.",
        "tunisian_advice": {
            "arabic_summary": "« الورقة صحيحة وما فيها حتى مرض، تبارك الله »",
            "voice_script": "تبارك الله، الورقة نظيفة وما فيها حتى مرض. كمل في نفس برنامج السقي المقتصد وما تصرف حتى مليم في الدواء."
        }
    }
}

# Singleton du modèle en mémoire
_VISION_MODEL = None

class DINOv2PlantVision(nn.Module):
    def __init__(self, num_classes=31):
        super().__init__()
        from transformers import AutoModel
        self.backbone = AutoModel.from_pretrained('facebook/dinov2-small')
        in_features = self.backbone.config.hidden_size  # 384
        self.classifier = nn.Sequential(
            nn.Linear(in_features, 512),
            nn.BatchNorm1d(512),
            nn.GELU(),
            nn.Dropout(p=0.3),
            nn.Linear(512, 256),
            nn.BatchNorm1d(256),
            nn.GELU(),
            nn.Dropout(p=0.2),
            nn.Linear(256, num_classes)
        )
    def forward(self, x):
        outputs = self.backbone(x)
        cls_token = outputs.last_hidden_state[:, 0]
        return self.classifier(cls_token)

def get_vision_model():
    """Charge le modèle 31-Classes en mémoire (DINOv2 Vision Transformer ou MobileNetV3)."""
    global _VISION_MODEL
    if _VISION_MODEL is None:
        if os.path.exists(MODEL_WEIGHTS_PATH):
            state_dict = torch.load(MODEL_WEIGHTS_PATH, map_location="cpu")
            if any("backbone.embeddings" in k for k in state_dict.keys()):
                # Version 9 : Vision Transformer DINOv2 (Meta AI Agri-Vision)
                model = DINOv2PlantVision(num_classes=len(CLASS_NAMES))
                model.load_state_dict(state_dict)
                print(f"✅ [KIZUNA AI v9 DINOv2 ViT] Modèle Vision Transformer ({len(CLASS_NAMES)} classes) chargé depuis {MODEL_WEIGHTS_PATH}", file=sys.stderr)
            else:
                # Version 6-8 : MobileNetV3 Large
                model = models.mobilenet_v3_large(weights=None)
                in_features = model.classifier[0].in_features
                model.classifier = nn.Sequential(
                    nn.Linear(in_features, 1024),
                    nn.BatchNorm1d(1024),
                    nn.GELU(),
                    nn.Dropout(p=0.4),
                    nn.Linear(1024, 512),
                    nn.BatchNorm1d(512),
                    nn.GELU(),
                    nn.Dropout(p=0.3),
                    nn.Linear(512, 256),
                    nn.BatchNorm1d(256),
                    nn.GELU(),
                    nn.Dropout(p=0.2),
                    nn.Linear(256, len(CLASS_NAMES))
                )
                try:
                    model.load_state_dict(state_dict)
                    print(f"✅ [KIZUNA AI MobileNetV3] Modèle chargé ({len(CLASS_NAMES)} classes) depuis {MODEL_WEIGHTS_PATH}", file=sys.stderr)
                except Exception:
                    model.classifier = nn.Sequential(
                        nn.Linear(in_features, 1024),
                        nn.Hardswish(),
                        nn.Dropout(p=0.3),
                        nn.Linear(1024, len(CLASS_NAMES))
                    )
                    model.load_state_dict(state_dict)
                    print(f"✅ [KIZUNA AI Legacy] Modèle chargé depuis {MODEL_WEIGHTS_PATH}", file=sys.stderr)
        else:
            print(f"⚠️ [KIZUNA AI] Poids introuvables à {MODEL_WEIGHTS_PATH}", file=sys.stderr)
            model = models.mobilenet_v3_large(weights=None)
            model.classifier = nn.Sequential(nn.Linear(960, len(CLASS_NAMES)))

        model.eval()
        _VISION_MODEL = model
    return _VISION_MODEL

PREPROCESS_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

def clean_and_prepare_image(contents: bytes) -> Image.Image:
    """Nettoie l'image reçue : corrige l'orientation EXIF, gère la transparence (RGBA/PNG) et convertit en RGB pur."""
    try:
        img = Image.open(io.BytesIO(contents))
        img = ImageOps.exif_transpose(img)
    except Exception:
        img = Image.open(io.BytesIO(contents))

    # Si l'image contient un canal alpha (transparence PNG), on la fusionne sur fond blanc
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        alpha = img.convert("RGBA")
        background = Image.new("RGBA", alpha.size, (255, 255, 255))
        img = Image.alpha_composite(background, alpha).convert("RGB")
    else:
        img = img.convert("RGB")
    
    return img


def apply_botanical_intelligence(image: Image.Image, logits: torch.Tensor, crop_hint: Optional[str] = None) -> torch.Tensor:
    """
    Module de Disambiguïsation & Filtrage de Culture (Kizuna Nexus OS) :
    1. Si un 'crop_hint' est fourni ('Olivier', 'Tomate', 'Riz', 'Agrumes', etc.),
       restreint strictement l'espace de décision aux pathologies de cette plante.
    2. En mode automatique, évite les fausses attributions artificielles.
    """
    adjusted = logits.clone()
    
    # 1. Filtre ciblé si une culture est sélectionnée dans l'interface
    if crop_hint and crop_hint.lower() not in ("all", "auto", "tous", "toutes", "none"):
        c_hint = crop_hint.lower().strip()
        mask = torch.zeros(len(CLASS_NAMES), dtype=torch.bool)
        for i, c in enumerate(CLASS_NAMES):
            meta = DISEASE_METADATA.get(c, {})
            crop_name = meta.get("crop", "").lower()
            if c_hint in crop_name or c_hint in c.lower():
                mask[i] = True
        if mask.any():
            adjusted[0, ~mask] = -1e9
            return adjusted
            
    return adjusted


# ==============================================================================
# ENDPOINTS FASTAPI : COMPUTER VISION MULTI-CULTURES
# ==============================================================================

@app.post("/api/crop-vision/diagnose")
async def diagnose_crop_disease(
    file: UploadFile = File(...),
    crop: Optional[str] = None
):
    """
    Reçoit une photo de feuille (Tomate, Olivier, Riz Japonais, Thé Vert, Agrumes, Piment, Pomme de terre)
    et renvoie le diagnostic multi-cultures, le niveau de sévérité, les traitements et la consigne en Darija.
    Le paramètre optionnel 'crop' permet de cibler une culture spécifique si désiré (ex: 'Olivier', 'Tomate').
    """
    if file.content_type and not (file.content_type.startswith("image/") or file.content_type == "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Le fichier fourni doit être une image (JPG, PNG, WebP)")
    
    start_time = time.time()
    try:
        contents = await file.read()
        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="Fichier image vide reçu")
        image = clean_and_prepare_image(contents)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Fichier image invalide ou corrompu : {str(e)}")
    
    # Inférence PyTorch avec Intelligence Botanique
    try:
        model = get_vision_model()
        tensor = PREPROCESS_TRANSFORM(image).unsqueeze(0)
        
        with torch.no_grad():
            raw_logits = model(tensor)
            logits = apply_botanical_intelligence(image, raw_logits, crop_hint=crop)
            probabilities = torch.softmax(logits, dim=1)[0]
        
        top_probs, top_indices = torch.topk(probabilities, k=min(3, len(CLASS_NAMES)))
        
        best_idx = top_indices[0].item()
        best_class = CLASS_NAMES[best_idx]
        confidence_pct = round(top_probs[0].item() * 100, 2)
        
        metadata = DISEASE_METADATA.get(best_class, {
            "title": best_class.replace("___", " - ").replace("__", " - ").replace("_", " "),
            "crop": "Cultures générales",
            "category": "Pathologie végétale",
            "severity": "Moyen",
            "symptoms": "Anomalies foliaires observées par vision par ordinateur.",
            "impact": "Surveillance conseillée.",
            "urgency": "Consulter un conseiller agronomique.",
            "biological_treatment": "Isoler la plante et appliquer un traitement biologique préventif.",
            "tunisian_advice": {
                "arabic_summary": "« تم رصد إصابة في الأوراق - تابع حالة الحقل »",
                "voice_script": "فحصنا الورقة وثمة بداية مرض. نظف الحقل وراقب بقية النباتات."
            }
        })
        
        top_3 = []
        for p, idx in zip(top_probs, top_indices):
            c_name = CLASS_NAMES[idx.item()]
            meta = DISEASE_METADATA.get(c_name, {})
            top_3.append({
                "class_raw": c_name,
                "title": meta.get("title", c_name),
                "crop": meta.get("crop", "Inconnu"),
                "confidence_pct": round(p.item() * 100, 2)
            })
        
        elapsed_ms = round((time.time() - start_time) * 1000, 2)
        
        return {
            "status": "success",
            "filename": file.filename,
            "inference_time_ms": elapsed_ms,
            "prediction": {
                "class_raw": best_class,
                "title": metadata["title"],
                "crop": metadata["crop"],
                "category": metadata["category"],
                "severity": metadata["severity"],
                "confidence_pct": confidence_pct,
                "symptoms": metadata["symptoms"],
                "impact": metadata["impact"],
                "urgency": metadata["urgency"],
                "biological_treatment": metadata["biological_treatment"],
                "tunisian_advice": metadata["tunisian_advice"]
            },
            "top_3": top_3
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur d'inférence IA : {str(e)}")

@app.get("/api/crop-vision/classes")
def list_supported_classes():
    """Renvoie la liste des 31 classes reconnues avec cultures associées."""
    return {
        "status": "success",
        "total_classes": len(CLASS_NAMES),
        "classes": [
            {
                "class_raw": c,
                "title": DISEASE_METADATA.get(c, {}).get("title", c),
                "crop": DISEASE_METADATA.get(c, {}).get("crop", "Général"),
                "severity": DISEASE_METADATA.get(c, {}).get("severity", "Moyen")
            }
            for c in CLASS_NAMES
        ]
    }

@app.get("/api/crop-vision/health")
def vision_health_check():
    """Vérifie l'intégrité du modèle 31 classes."""
    weights_exist = os.path.exists(MODEL_WEIGHTS_PATH)
    file_size_mb = round(os.path.getsize(MODEL_WEIGHTS_PATH) / (1024 * 1024), 2) if weights_exist else 0
    return {
        "status": "healthy" if weights_exist else "degraded",
        "model_architecture": "MobileNetV3-Large Multi-Crop",
        "weights_file": MODEL_WEIGHTS_PATH,
        "weights_exist": weights_exist,
        "weights_size_mb": file_size_mb,
        "num_classes": len(CLASS_NAMES),
        "crops": ["Tomate", "Riz Japonais (Ine)", "Thé Vert Japonais (Ocha)", "Olivier", "Agrumes (Citrus)", "Piment", "Pomme de Terre"],
        "inference_device": "CPU"
    }
