@echo off
chcp 65001 >nul
title KIZUNA 2026 - Installation des Dépendances

echo ==============================================================
echo       🌱 INSTALLATION DES DÉPENDANCES PYTHON - KIZUNA 2026
echo ==============================================================
echo.
echo Installation de PyTorch, FastAPI, Transformers, Pillow, etc.
echo Veuillez patienter quelques minutes...
echo.

where py >nul 2>nul
if %errorlevel% equ 0 (
    py -m pip install --upgrade pip
    py -m pip install -r requirements.txt
) else (
    python -m pip install --upgrade pip
    python -m pip install -r requirements.txt
)

echo.
echo ==============================================================
echo [OK] Installation terminée avec succès !
echo Vous pouvez maintenant double-cliquer sur 'DEMARRER_SERVEUR.bat'.
echo ==============================================================
pause
