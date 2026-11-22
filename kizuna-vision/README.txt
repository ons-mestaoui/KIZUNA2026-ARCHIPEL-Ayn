===========================================================
🌿 KIZUNA NEXUS OS - API FASTAPI (TUNISIE x JAPON)
===========================================================

1. PREREQUIS :
   - Python 3.10 ou supérieur installé

2. INSTALLATION DES DEPENDANCES :
   Ouvrez un terminal (PowerShell ou CMD) dans ce dossier et tapez :
   pip install -r requirements.txt

3. LANCEMENT DU SERVEUR :
   uvicorn main:app --reload --port 8000

4. TESTER DANS LE NAVIGATEUR :
   Ouvrez : http://127.0.0.1:8000/docs

5. ENDPOINTS PRINCIPAUX :
   - POST /api/crop-vision/diagnose : Envoi photo de feuille (multipart/form-data)
   - GET  /api/crop-vision/classes  : Liste des 11 classes reconnues
   - GET  /api/crop-vision/health   : Etat de sante du modele
   - POST /api/simulate             : Simulateur solaire & irrigation (FAO-56)
===========================================================
