import io
import os
import sys
import time
from typing import List, Optional

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import requests

import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image

# ==============================================================================
# APPLICATION FASTAPI : KIZUNA NEXUS OS (TUNISIE × JAPON)
# ==============================================================================
app = FastAPI(
    title="KIZUNA Nexus API",
    description="API de pilotage Solaire, Eau, Résilience Agricole & Vision IA pour la Tunisie",
    version="1.1.0"
)

# 1. Autoriser le frontend (React / Next.js / HTML) à communiquer avec l'API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Autorise tous les frontends locaux ou distants
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# MODULE 1 : SIMULATION SOLAIRE & IRRIGATION RAISONNÉE (FAO-56)
# ==============================================================================

# Coordonnées des gouvernorats tunisiens
GOVERNORATES = {
    "Sidi Bouzid": (35.0382, 9.4849),
    "Kairouan": (35.6781, 10.0963),
    "Nabeul": (36.4561, 10.7376),
    "Sfax": (34.7406, 10.7603),
    "Béja": (36.7256, 9.1817)
}

# Modèle de données reçu du frontend
class SimulationRequest(BaseModel):
    governorate: str = "Sidi Bouzid"
    solar_kwc: float = 10.0
    pump_kw: float = 5.5

# Route principale appelée par vos composants web
@app.post("/api/simulate")
def run_simulation(req: SimulationRequest):
    lat, lon = GOVERNORATES.get(req.governorate, (35.0382, 9.4849))

    # 24 heures de simulation
    hours = np.arange(24)

    # Profil solaire tunisien (GHI max à 950 W/m² à midi)
    solar_profile = np.maximum(0, np.sin((hours - 6) / 14 * np.pi)) ** 1.3
    ghi = solar_profile * 950.0

    # Température et humidité (canicule estivale)
    temp = 22.0 + 16.0 * np.maximum(0, np.sin((hours - 8) / 14 * np.pi))
    humidity = 70.0 - 45.0 * np.maximum(0, np.sin((hours - 8) / 14 * np.pi))
    wind = 12.0 + 8.0 * np.sin(hours / 24 * np.pi)

    # Calculs physiques : Puissance solaire nette (avec perte de surchauffe > 25°C)
    thermal_loss = np.maximum(0, (temp - 25.0) * 0.004)
    pv_power = req.solar_kwc * (ghi / 1000.0) * (1.0 - thermal_loss)

    # Quantiles d'incertitude météo (P10 pessimiste, P90 optimiste)
    p10 = pv_power * 0.85
    p90 = np.clip(pv_power * 1.15, 0, req.solar_kwc)

    # Risque d'évaporation d'eau (FAO-56)
    evap_risk = np.clip((temp / 45.0) * 0.5 + ((100.0 - humidity) / 100.0) * 0.3 + (wind / 30.0) * 0.2, 0, 1)

    # Décision de pompage : Solaire suffisant ET évaporation modérée
    can_pump = (pv_power >= req.pump_kw) & (evap_risk < 0.65)

    # Calculs des impacts financiers et écologiques
    total_kwh = float(pv_power.sum())
    pump_hours = int((pv_power >= req.pump_kw).sum())
    money_saved_month = pump_hours * req.pump_kw * 0.260 * 30  # Tarif STEG BT
    water_saved_m3_day = 4 * 18.0 * 0.30  # 4h de pic évitées à 18m³/h avec 30% d'évaporation évitée
    co2_avoided_kg_day = total_kwh * 0.52

    # Construction de la réponse horaire pour les graphiques du frontend
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
# MODULE 2 : COMPUTER VISION IA (MOBILENETV3 - DIAGNOSTIC DES MALADIES)
# ==============================================================================

# Emplacement du fichier de poids (.pth exporté de Kaggle)
MODEL_WEIGHTS_PATH = os.getenv(
    "MODEL_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "tomato_disease_mobilenetv3.pth")
)

# 11 Classes du modèle (ordonnées alphabétiquement selon l'entraînement)
CLASS_NAMES = [
    "Tomato___Bacterial_spot",
    "Tomato___Early_blight",
    "Tomato___Late_blight",
    "Tomato___Leaf_Mold",
    "Tomato___Septoria_leaf_spot",
    "Tomato___Spider_mites Two-spotted_spider_mite",
    "Tomato___Target_Spot",
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus",
    "Tomato___Tomato_mosaic_virus",
    "Tomato___Tuta_absoluta",
    "Tomato___healthy"
]

# Base de connaissances agronomiques experte avec conseils en Darija tunisienne
DISEASE_METADATA = {
    "Tomato___Bacterial_spot": {
        "title": "Gale Bactérienne de la Tomate (Bacterial Spot)",
        "crop": "Tomate",
        "category": "Infection Bactérienne (Xanthomonas)",
        "severity": "Élevé",
        "symptoms": "Petites taches noires aqueuses avec halo jaune sur les feuilles et lésions rugueuses sur fruits.",
        "impact": "Baisse de photosynthèse et dépréciation marchande des fruits (20% à 40%).",
        "urgency": "Intervention sous 48 heures pour éviter la propagation aux fleurs.",
        "biological_treatment": "1. Pulvériser de la bouillie bordelaise ou oxychlorure de cuivre à dose modérée.<br>2. Éviter tout arrosage par aspersion foliaire.<br>3. Désinfecter les sécateurs à l'alcool 70°.",
        "tunisian_advice": {
            "arabic_summary": "« طاشات كحلة بكتيرية في الطماطم - يلزم دواء النحاس وما تبلوش الورقة »",
            "voice_script": "ثمة بكتيريا ضربت ورقة الطماطم بطاشات كحلة. داوي بدواء النحاس وما ترشش الماء فوق الأوراق باش ما تنتشرش العدوى."
        }
    },
    "Tomato___Early_blight": {
        "title": "Alternariose / Brûlure Précoce (Early Blight)",
        "crop": "Tomate",
        "category": "Infection Fongique (Alternaria solani)",
        "severity": "Moyen",
        "symptoms": "Taches concentriques circulaires brunes 'en cible' sur les feuilles basales âgées.",
        "impact": "Défoliation progressive partant du bas du plant.",
        "urgency": "Traitement fongicide préventif dès l'apparition des premières taches concentriques.",
        "biological_treatment": "1. Couper et brûler les feuilles basses touchées.<br>2. Traiter avec du bicarbonate de potassium ou décoction de prêle.<br>3. Pailler le sol pour stopper les éclaboussures de terre.",
        "tunisian_advice": {
            "arabic_summary": "« احتراق بدري في أوراق الطماطم الواطية - قص الأوراق الميتة »",
            "voice_script": "هذا مرض الألترناريا في الوراق اللوطانية. قص الأوراق المريضة من قاع الشجرة وعقم يديك وبدل نظام السقيان."
        }
    },
    "Tomato___Late_blight": {
        "title": "Mildiou de la Tomate / Brûlure Tardive (Late Blight)",
        "crop": "Tomate",
        "category": "Pseudo-champignon Oomycète (Phytophthora infestans)",
        "severity": "Critique",
        "symptoms": "Grandes nécroses huileuses brun foncé à noires avec duvet blanchâtre sous la feuille par temps humide.",
        "impact": "Destruction foudroyante des plants en 48 à 72 heures si l'humidité persiste.",
        "urgency": "Alerte maximale : intervention immédiate sous 24h.",
        "biological_treatment": "1. Éliminer immédiatement les plants fortement atteints.<br>2. Pulvériser de la bouillie bordelaise (cuivre).<br>3. Aérer la parcelle et suspendre toute aspersion.",
        "tunisian_advice": {
            "arabic_summary": "« فحة وميلديو سريع في الطماطم - رد بالك يلزم النحاس في 24 ساعة »",
            "voice_script": "رد بالك مليح، هذا الميليو أو الفحة يطيح شجر الطماطم في يومين. رش دواء النحاس فورا ووقف أي ري فوق الأوراق."
        }
    },
    "Tomato___Leaf_Mold": {
        "title": "Cladosporiose / Moisissure des Feuilles (Leaf Mold)",
        "crop": "Tomate",
        "category": "Infection Fongique de Serre (Passalora fulva)",
        "severity": "Moyen",
        "symptoms": "Taches vert pâle à jaunâtres sur le dessus, feutrage velouté olive à brun sous la feuille.",
        "impact": "Ralentissement photosynthétique sous serres humides mal ventilées.",
        "urgency": "Améliorer l'aération et la ventilation sous 3 jours.",
        "biological_treatment": "1. Aérer largement les serres aux heures chaudes pour abaisser l'hygrométrie sous 80%.<br>2. Effeuiller les étages denses.<br>3. Application foliaire de savon noir dilué ou purin d'ortie.",
        "tunisian_advice": {
            "arabic_summary": "« صوف وموسوسة تحت ورقة الطماطم في البيت المحمي - هوّي البيت »",
            "voice_script": "الرطوبة الزايدة في البيت البلاستيكي عملت غبرة تحت الورقة. حل الشبابيك وهوّي البيت مليح ونقص الرطوبة."
        }
    },
    "Tomato___Septoria_leaf_spot": {
        "title": "Septoriose de la Tomate (Septoria Leaf Spot)",
        "crop": "Tomate",
        "category": "Infection Fongique (Septoria lycopersici)",
        "severity": "Moyen",
        "symptoms": "Multiples petites taches circulaires grises au centre et bordées de noir avec ponctuations sombres.",
        "impact": "Jaunissement et chute prématurée des feuilles.",
        "urgency": "Suppression des foyers primaires sous 48h.",
        "biological_treatment": "1. Enlever les feuilles atteintes dès leur apparition.<br>2. Pulvériser une solution de bicarbonate de soude (5g/L) additionnée de savon noir.<br>3. Pailler abondamment les pieds.",
        "tunisian_advice": {
            "arabic_summary": "« تنقيط وتبقع رمادي في الأوراق - استعمل البيكربونات »",
            "voice_script": "الأوراق فيها نقاط رمادية متاع سيبتوريا. نظف الحقل من الأوراق المضروبة ورش البيكربونات مع الصابون الأخضر."
        }
    },
    "Tomato___Spider_mites Two-spotted_spider_mite": {
        "title": "Tétranyque Tisserand / Acariens Jaunes (Spider Mites)",
        "crop": "Tomate",
        "category": "Acarien Ravageur (Tetranychus urticae)",
        "severity": "Élevé",
        "symptoms": "Mouchetures jaunâtres minuscules, aspect terne et présence de fines toiles soyeuses sous la feuille.",
        "impact": "Dessèchement complet du feuillage en période de canicule et air sec.",
        "urgency": "Intervention sous 48h avant prolifération explosive.",
        "biological_treatment": "1. Augmenter l'hygrométrie ambiante (les acariens fuient l'humidité).<br>2. Pulvériser de l'huile de neem ou du savon potassique sous les feuilles.<br>3. Lâcher d'auxiliaires prédateurs (Phytoseiidae).",
        "tunisian_advice": {
            "arabic_summary": "« حريشة ورتيلا صفراء على الطماطم - رش زيت النيم وعلي الرطوبة »",
            "voice_script": "هذي الورتيلا الصفراء أو العث ضربت الأوراق بالخيوط متاعها. رش زيت النيم ولا الصابون تحت الورقة في الصباح الباكر."
        }
    },
    "Tomato___Target_Spot": {
        "title": "Taches Cibles de la Tomate (Target Spot)",
        "crop": "Tomate",
        "category": "Infection Fongique (Corynespora cassiicola)",
        "severity": "Moyen",
        "symptoms": "Lésions nécrotiques circulaires brunes à centre clair bien délimité.",
        "impact": "Perte de feuillage et attaques possibles sur fruits immatures.",
        "urgency": "Élagage préventif sous 3 à 5 jours.",
        "biological_treatment": "1. Éliminer les résidus de culture infectés.<br>2. Appliquer un antifongique biologique à base de Bacillus subtilis.<br>3. Respecter un espacement suffisant entre les plants.",
        "tunisian_advice": {
            "arabic_summary": "« بقع دائرية في الورقة - هوّي بين الخطوط ونظف المخلفات »",
            "voice_script": "ثمة بقع دائرية متاع فطر التارجت سبوت. باعد بين الشجرات باش يدخل الريح ونظف الحقل من الأعشاب الطفيلية."
        }
    },
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus": {
        "title": "Virus des Feuilles Jaunes en Cuillère (TYLCV)",
        "crop": "Tomate",
        "category": "Phytovirus transmis par Aleurode (Bemisia tabaci)",
        "severity": "Critique",
        "symptoms": "Feuilles rabougries, dressées en forme de cuillère, bordures jaunies et arrêt de croissance.",
        "impact": "Perte de récolte pouvant atteindre 80% à 100% si l'infection est précoce.",
        "urgency": "Arrachage immédiat des plants atteints et lutte vectorielle.",
        "biological_treatment": "1. Poser des panneaux jaunes englués pour piéger la mouche blanche (Bemisia tabaci).<br>2. Filets anti-insectes sur les serres (maille < 0.4mm).<br>3. Arracher et détruire les pieds virés.",
        "tunisian_advice": {
            "arabic_summary": "« فيروس التواء الأوراق الصفراء (التبسي) - حط الفخاخ الصفراء للمن الأبيض »",
            "voice_script": "رد بالك هذا فيروس التواء الأوراق اللي تنقلو الذبابة البيضاء. حط اللصاقات الصفراء في الحقل واقلع الشجرة المضروبة فيسع."
        }
    },
    "Tomato___Tomato_mosaic_virus": {
        "title": "Virus de la Mosaïque de la Tomate (ToMV)",
        "crop": "Tomate",
        "category": "Tobamovirus ultra-résistant",
        "severity": "Élevé",
        "symptoms": "Marbrures en damier vert clair et vert foncé, cloquage et déformation des feuilles.",
        "impact": "Croissance ralentie et fruits marbrés impropres à la vente.",
        "urgency": "Désinfection sanitaire stricte.",
        "biological_treatment": "1. Se désinfecter soigneusement les mains au lait écrémé ou savon avant manipulation.<br>2. Arracher et détruire les plants infectés.<br>3. Ne jamais fumer dans les parcelles (transmission par le tabac).",
        "tunisian_advice": {
            "arabic_summary": "« فيروس الموزاييك (تشوه الورقة بالأخضر الفاتح) - عقم يديك وما تدخنش في الحقل »",
            "voice_script": "هذا فيروس الموزاييك ينتقل باللمس. عقم يديك ومقص التقليم واقلع الشجرة المريضة وما تدخنش الدخان بحذا الطماطم."
        }
    },
    "Tomato___Tuta_absoluta": {
        "title": "Mineuse de la Tomate (Tuta absoluta) - Partenariat Tokyo Agri",
        "crop": "Tomate",
        "category": "Lépidoptère Ravageur Foliaire Clé",
        "severity": "Urgence Critique",
        "symptoms": "Galeries et plages translucides blanchâtres rongées par les larves à l'intérieur du parenchyme foliaire.",
        "impact": "Destruction totale de la récolte (50% à 100%) par perforation des fruits et pourriture secondaire.",
        "urgency": "Intervention sous 24 à 48 heures pour stopper le cycle larvaire.",
        "biological_treatment": "1. Installer immédiatement 30 à 40 pièges à phéromones sexuelles (Tcolure) par hectare.<br>2. Pulvériser en soirée du Bacillus thuringiensis var. kurstaki (1 à 2 kg/ha).<br>3. Introduire la punaise prédatrice indigène Nesidiocoris tenuis.<br>4. Stopper immédiatement toute aspersion foliaire.",
        "tunisian_advice": {
            "arabic_summary": "« سوسة الطماطم توتا ابسولوتا - حط فخاخ الفيرومون ورش الباسيلوس فيسع »",
            "voice_script": "التصويرية اللي بعثتها تبين بداية توتا ابسولوتا في الطماطم. حط فخاخ الفيرومون في الحقل، رش بكتيريا الباسيلوس في المغرب، وما ترشش بالماء الفوقاني."
        }
    },
    "Tomato___healthy": {
        "title": "Feuille de Tomate Vigoureuse & Parfaitement Saine",
        "crop": "Tomate",
        "category": "État Optimal (Zéro Pathologie)",
        "severity": "Aucun (Sain)",
        "symptoms": "Couleur vert franc homogène, cuticule brillante, aucun signe nécrotique ni piqûre parasitaire.",
        "impact": "Aucun risque. Potentiel de photosynthèse et rendement maximal.",
        "urgency": "Continuer le pilotage hydrique et nutritionnel régulier.",
        "biological_treatment": "Aucun traitement chimique ou biologique requis. Maintenir l'irrigation raisonnée aux heures fraîches.",
        "tunisian_advice": {
            "arabic_summary": "« الورقة صحيحة وما فيها حتى مرض، تبارك الله »",
            "voice_script": "تبارك الله، الورقة نظيفة وما فيها حتى مرض. كمل في نفس برنامج السقي المقتصد وما تصرف حتى مليم في الدواء."
        }
    }
}

# Singleton du modèle en mémoire
_VISION_MODEL = None

def get_vision_model():
    """Charge le modèle MobileNetV3 une seule fois en mémoire pour une latence < 25 ms."""
    global _VISION_MODEL
    if _VISION_MODEL is None:
        model = models.mobilenet_v3_large(weights=None)
        in_features = model.classifier[0].in_features
        model.classifier = nn.Sequential(
            nn.Linear(in_features, 1024),
            nn.Hardswish(),
            nn.Dropout(p=0.3),
            nn.Linear(1024, len(CLASS_NAMES))
        )
        if os.path.exists(MODEL_WEIGHTS_PATH):
            state_dict = torch.load(MODEL_WEIGHTS_PATH, map_location="cpu")
            model.load_state_dict(state_dict)
            print(f"✅ [KIZUNA AI] Modèle MobileNetV3 ({len(CLASS_NAMES)} classes) chargé avec succès depuis {MODEL_WEIGHTS_PATH}", file=sys.stderr)
        else:
            print(f"⚠️ [KIZUNA AI] Poids introuvables à {MODEL_WEIGHTS_PATH}. Le modèle utilisera les poids aléatoires.", file=sys.stderr)
        
        model.eval()
        _VISION_MODEL = model
    return _VISION_MODEL

# Pipeline de transformation de l'image (identique à l'entraînement Kaggle)
PREPROCESS_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])


# ==============================================================================
# ENDPOINTS FASTAPI : COMPUTER VISION
# ==============================================================================

@app.post("/api/crop-vision/diagnose")
async def diagnose_crop_disease(file: UploadFile = File(...)):
    """
    Reçoit une photo de feuille maraîchère (Tomate, Tuta absoluta, etc.)
    et renvoie le diagnostic d'intelligence artificielle, le niveau de sévérité,
    les traitements biologiques et la consigne audio en Darija tunisienne.
    """
    # Validation du format
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Le fichier fourni doit être une image (JPG, PNG, WebP)")
    
    start_time = time.time()
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Fichier image invalide : {str(e)}")
    
    # Prétraitement et inférence PyTorch
    model = get_vision_model()
    tensor = PREPROCESS_TRANSFORM(image).unsqueeze(0)
    
    with torch.no_grad():
        logits = model(tensor)
        probabilities = torch.softmax(logits, dim=1)[0]
    
    top_probs, top_indices = torch.topk(probabilities, k=min(3, len(CLASS_NAMES)))
    
    best_idx = top_indices[0].item()
    best_class = CLASS_NAMES[best_idx]
    confidence_pct = round(top_probs[0].item() * 100, 2)
    
    # Extraction des métadonnées expertes
    metadata = DISEASE_METADATA.get(best_class, {
        "title": best_class.replace("___", " - "),
        "crop": "Tomate",
        "category": "Pathologie végétale",
        "severity": "Moyen",
        "symptoms": "Anomalies foliaires observées par vision par ordinateur.",
        "impact": "Surveillance conseillée.",
        "urgency": "Consulter un conseiller agronomique.",
        "biological_treatment": "Isoler la plante et appliquer un traitement préventif biologique.",
        "tunisian_advice": {
            "arabic_summary": "« تم رصد إصابة في الأوراق - تابع حالة الحقل »",
            "voice_script": "فحصنا الورقة وثمة بداية مرض. نظف الحقل وراقب بقية النباتات."
        }
    })
    
    # Top 3 probabilités
    top_3 = []
    for p, idx in zip(top_probs, top_indices):
        c_name = CLASS_NAMES[idx.item()]
        meta = DISEASE_METADATA.get(c_name, {})
        top_3.append({
            "class_raw": c_name,
            "title": meta.get("title", c_name),
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

@app.get("/api/crop-vision/classes")
def list_supported_classes():
    """Renvoie la liste des 11 classes reconnues par le modèle de vision avec leurs métadonnées."""
    return {
        "status": "success",
        "total_classes": len(CLASS_NAMES),
        "classes": [
            {
                "class_raw": c,
                "title": DISEASE_METADATA[c]["title"],
                "severity": DISEASE_METADATA[c]["severity"],
                "crop": DISEASE_METADATA[c]["crop"]
            }
            for c in CLASS_NAMES
        ]
    }

@app.get("/api/crop-vision/health")
def vision_health_check():
    """Vérifie l'état d'intégrité du modèle MobileNetV3 et des poids sur le serveur."""
    weights_exist = os.path.exists(MODEL_WEIGHTS_PATH)
    file_size_mb = round(os.path.getsize(MODEL_WEIGHTS_PATH) / (1024 * 1024), 2) if weights_exist else 0
    return {
        "status": "healthy" if weights_exist else "degraded",
        "model_architecture": "MobileNetV3-Large",
        "weights_file": MODEL_WEIGHTS_PATH,
        "weights_exist": weights_exist,
        "weights_size_mb": file_size_mb,
        "num_classes": len(CLASS_NAMES),
        "inference_device": "CPU"
    }
