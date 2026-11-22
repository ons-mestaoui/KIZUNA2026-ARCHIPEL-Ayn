@echo off
chcp 65001 >nul
title KIZUNA 2026 - Serveur Vision IA

echo ==============================================================
echo       🌱 HACKATHON KIZUNA 2026 - API VISION IA (DINOv2)
echo       Tunisie x Japon : Tomates, Oliviers, Riz, Thé, Agrumes
echo ==============================================================
echo.
echo [1/2] Lancement de l'API FastAPI sur http://localhost:8000 ...
echo [INFO] Pour tester immédiatement, ouvrez le fichier : kizuna_api_tester.html
echo [INFO] Documentation Swagger interactive : http://localhost:8000/docs
echo.

where py >nul 2>nul
if %errorlevel% equ 0 (
    py -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
) else (
    python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
)

if %errorlevel% neq 0 (
    echo.
    echo [ERREUR] Le serveur n'a pas pu démarrer.
    echo Vérifiez que Python et les dépendances sont installés en lançant 'INSTALLER_DEPENDANCES.bat'.
    pause
)
