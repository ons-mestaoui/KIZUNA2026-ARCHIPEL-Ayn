================================================================================
🌱 HACKATHON KIZUNA 2026 (Tunisie x Japon) - API VISION IA CROPS
================================================================================

Ce dossier contient l'intégralité du module d'Intelligence Artificielle Vision
pour la détection des maladies végétales, prêt pour la production et l'intégration.

Modèle IA : DINOv2 Vision Transformer (Meta AI ViT)
Poids inclus : tomato_disease_mobilenetv3.pth (85.5 MB)
Cultures couvertes (31 classes) :
  - Tunisie : Tomate (11 dont Tuta Absoluta), Olivier (3 dont Œil de Paon), Agrumes (4), Pomme de terre, Piment
  - Japon   : Riz Japonais (4 dont Pyriculariose / Blast), Thé Vert Japonais (4)

--------------------------------------------------------------------------------
📂 CONTENU DU PACK
--------------------------------------------------------------------------------
1. main.py                    : Le serveur backend FastAPI complet avec moteur d'inférence,
                                disambiguation botanique automatique et fiches agricoles.
2. tomato_disease_mobilenetv3.pth : Les poids du modèle DINOv2 entraîné (85.5 MB).
3. kizuna_api_tester.html     : Interface web interactive moderne (Glisser-Déposer, prédictions,
                                audio Darija tunisienne, filtres de culture).
4. requirements.txt           : Liste exacte des bibliothèques Python requises.
5. DEMARRER_SERVEUR.bat       : Script 1-clic pour démarrer le serveur FastAPI sur le port 8000.
6. INSTALLER_DEPENDANCES.bat  : Script 1-clic pour installer automatiquement les packages.

--------------------------------------------------------------------------------
🚀 DÉMARRAGE RAPIDE (POUR TON COÉQUIPIER)
--------------------------------------------------------------------------------

Option A — En 2 clics (Windows) :
  1. Double-clique sur "INSTALLER_DEPENDANCES.bat" (une seule fois pour installer les packages).
  2. Double-clique sur "DEMARRER_SERVEUR.bat".
  3. Ouvre "kizuna_api_tester.html" dans n'importe quel navigateur (Chrome, Edge, Firefox).

Option B — En ligne de commande (Terminal / PowerShell / Linux / Mac) :
  1. Installer les packages :
     pip install -r requirements.txt

  2. Démarrer l'API :
     uvicorn main:app --host 0.0.0.0 --port 8000 --reload

--------------------------------------------------------------------------------
🔌 ENDPOINTS API (POUR L'APPLICATION MOBILE / FRONTEND)
--------------------------------------------------------------------------------

• Health Check & Statut du Modèle :
  GET http://localhost:8000/api/crop-vision/health

• Diagnostic d'une feuille :
  POST http://localhost:8000/api/crop-vision/diagnose
  Paramètres (Multipart / Form-Data) :
    - file: Fichier image (JPEG ou PNG)
    - crop_hint (optionnel): "Auto" (défaut), "Olive", "Tomato", "Rice", "Tea", "Citrus", etc.

• Documentation Swagger interactive :
  http://localhost:8000/docs
================================================================================
