@echo off
chcp 65001 >nul
title KIZUNA 2026 - Rendre l'API Publique Mondiale (Cloudflare Tunnel)

echo ==============================================================
echo       🌐 OUVERTURE DE L'API AU MONDE ENTIER (HTTPS PUBLIC)
echo       Accessible depuis n'importe quel smartphone, PC ou pays !
echo ==============================================================
echo.
echo [1] Assurez-vous que 'DEMARRER_SERVEUR.bat' tourne deja dans une autre fenetre.
echo [2] Creation d'une URL publique securisee (HTTPS) en cours...
echo.

where cloudflared >nul 2>nul
if %errorlevel% equ 0 (
    cloudflared tunnel --url http://localhost:8000
) else if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
    "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:8000
) else (
    echo Cloudflared n'est pas dans le PATH. Tentative avec npx localtunnel...
    npx localtunnel --port 8000
)
pause
