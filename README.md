# Goutte d'Or AI

Know exactly when to water your farm — from the weather, the satellites and your solar pump.
Built for the **Kizuna hackathon (Tunisia × Japan)** · theme: water, energy, agriculture.

A farmer signs in, drops a pin on the farm, answers four short questions (crop, water source, soil,
last watering) and gets:

| | |
|---|---|
| **Today** | Water or not, how many m³, and *when* — with a 3D digital twin of the farm that follows the sun |
| **Week** | A 7-day plan; every day assumes the farmer followed the one before |
| **Leaf check** | A photo of a sick leaf → likely cause, safe actions, honest confidence, spoken aloud |
| **Ask** | A chat in Arabic (Tunisian Derja), French, Japanese or English, with optional photo and voice |
| **Satellite** | Rain, soil moisture, ground temperature and greenness from JAXA satellites, plus Sentinel-2 imagery |

The interface is in **English, العربية (RTL) and 日本語**; the AI answers in whatever language the farmer writes.

## How the plan is made

* **FAO-56 water balance** (the standard irrigation-science method) per day: `ETc = Kc × ET₀`, root-zone
  depletion, rain counted once, irrigation logged by the farmer, squeeze-test answers re-anchoring the estimate.
  No sensor needed. ET₀ and rain come from **Open-Meteo**.
* **Five water sources**, each planned differently: solar + storage basin (pump at solar peak, water at dawn
  and dusk), solar direct, grid, diesel, shared network. Limits (small basin, slow network, no sun) are
  reported, never silent.
* **AI is for explaining and listening, not for the arithmetic.** Gemini reads leaf photos and chats; the
  numbers come from the engine in `lib/engine` (pure TypeScript, 49 tests).
* The "saves X % vs pumping every sunny hour" figure compares the plan with a pump that simply runs whenever
  the sun is out. On days when nothing is needed the app just says the pump can rest.

## Run it locally

Needs Node 20.9 or newer (developed and tested on Node 24).

```bash
npm install
cp .env.example .env.local        # then fill it in (see below)
npx drizzle-kit push              # creates the local SQLite database
npm run dev                       # http://localhost:3000
```

Open the page → *Create your farm account* → pick a place → get a plan.

### Environment variables (`.env.local`)

| Variable | What for |
|---|---|
| `BETTER_AUTH_SECRET` | Signs sessions. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `BETTER_AUTH_URL` | The app's own address (`http://localhost:3000`, later the Vercel URL) |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Other addresses allowed to sign in, comma-separated, `*` matches one part — e.g. phones on the Wi-Fi: `http://192.168.*.*:3000` (see *Phones on the same Wi-Fi*) |
| `DATABASE_URL` | Default `file:data/local.db`. Production: the Turso `libsql://…` URL |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | What the Vercel ↔ Turso integration injects (used if `DATABASE_URL` is unset) |
| `GEMINI_API_KEY` | Google AI Studio key (free tier). Leaf check and Ask need it |
| `GEMINI_API_KEY_DEMO` | Optional second key used only by the demo account, so judges can't use up the pitch's quota |
| `GEMINI_MODELS_CHAT`, `GEMINI_MODELS_VISION_FAST`, `GEMINI_MODELS_VISION_STRONG` | Optional comma-separated model chains (defaults in `lib/server/gemini.ts`) |
| `AI_PHOTOS_PER_DAY`, `AI_CHATS_PER_DAY` | Per-farmer daily caps (default 6 / 30) |
| `DEMO_ENTRY`, `DEMO_PASSWORD` | Switch the demo on (`DEMO_ENTRY=1`) and set the demo account's password |
| `DEMO_OFFLINE` | `1` = the demo serves saved answers (labelled) instead of calling Gemini |
| `DEMO_PHOTOS_PER_DAY`, `DEMO_CHATS_PER_DAY` | The demo account's own, larger caps (40 / 150) |
| `NEXT_PUBLIC_APP_URL` | Pins the address in the demo's QR code. Normally not needed: the QR uses the page's own address, or the laptop's Wi-Fi address when the demo is opened on `localhost`. Read at build time |
| `TTS_VOICE_AR`, `TTS_VOICE_JA`, `TTS_VOICE_EN`, `TTS_VOICE_FR` | Override a voice (default `ar-TN-HediNeural`; try `ar-TN-ReemNeural`) |

## The demo (separate, never the default)

The landing page never mentions it. Ways in:

* sign in with **`demo@goutte-dor.app`** and the password from `DEMO_PASSWORD`
* **press and hold the logo** for 1.5 s (phone)
* press **Shift + D** on the landing page (laptop)
* open **`/?demo=kizuna`**

Each entry resets the demo farm. `/demo` shows the 21 July 2026 heatwave at Cap Bon (45.8 °C, real ERA5
data) with a **virtual soil sensor** — pour water and watch the twin and the plan react — and a QR code so
judges can sign up on their own phones. Leaf check, Ask and Satellite are the real features on the demo farm.
The Arduino idea became this virtual sensor.

## If the Wi-Fi misbehaves during the pitch

* **Saved answers.** Start the server with `DEMO_OFFLINE=1` and the demo account answers the Leaf check and
  Ask from saved content in English, Arabic and Japanese, without calling Gemini. Every such answer carries a
  *Saved demo answer* label, so nobody mistakes it for the live AI. Check it with
  `node scripts/smoke-offline.mjs <url>`.
* **Works with no internet at all:** the 3D twin, the plan, the virtual soil sensor and the heatwave day. They
  run on weather snapshots bundled with the app.
* **Needs internet:** the live AI, map tiles, the Satellite tab and the server voice. With no connection each
  satellite card says it could not reach the data and offers *Try again*; an outage is never remembered, so the
  cards recover by themselves when the network returns. *Listen* falls back to the device's own voice (how good
  it sounds in Arabic or Japanese depends on the phone).
* **Rehearse a real outage** on the same laptop: start a second copy with saved answers, an invalid Gemini key
  and every outgoing request refused (Node 24+), then run the Wi-Fi-off suite against it.

  ```powershell
  $env:BETTER_AUTH_URL = "http://localhost:3002"; $env:DEMO_OFFLINE = "1"
  $env:GEMINI_API_KEY = "x"; $env:GEMINI_API_KEY_DEMO = "x"
  $env:NODE_USE_ENV_PROXY = "1"; $env:HTTPS_PROXY = "http://127.0.0.1:9"; $env:NO_PROXY = "localhost,127.0.0.1"
  npm start -- -p 3002
  node scripts/browser/offline.mjs http://localhost:3002 browser-out leaf.jpg
  ```
* **Farmers in a field with no signal:** the last good plan stays on the phone and is shown under a
  "No connection. Showing the plan saved …" banner. It is removed on sign-out, on every sign-in and when the
  demo door opens, so on a shared phone nobody sees the previous farmer's plan.

## Tests

```bash
npm test                                   # 49 engine tests
node scripts/smoke-auth.mjs  <url> --deep  # sign-up / sign-in / sign-out, guarded pages, database + live Gemini / voice / JAXA
node scripts/smoke-farm.mjs  <url>         # farm API, 7-day plan, logging, isolation between farmers
node scripts/smoke-demo.mjs  <url>         # demo door, reset, isolation
node scripts/smoke-chat.mjs  <url>         # chat in four languages
node scripts/smoke-offline.mjs <url>       # the demo's saved answers (server started with DEMO_OFFLINE=1)
node scripts/smoke-satellite.mjs <url>     # the four satellite metrics
node scripts/smoke-ai.mjs    <url> photo.jpg  # leaf diagnosis in three languages + voice
```

Point them at `http://localhost:3000` or at the deployed URL.

### Browser suites

`npm install` also installs `puppeteer-core`, which drives your installed Chrome (set `CHROME_PATH` if it is
not at the usual Windows location). With the app running:

```bash
node scripts/browser/run-all.mjs http://localhost:3000
node scripts/browser/run-all.mjs http://localhost:3000 --photo=leaf.jpg --lan=http://192.168.1.20:3000
```

They sign up, onboard, read the plan and press the buttons on a phone-sized touch screen and on a desktop, in
English, Arabic (right to left) and Japanese, and fail on console errors or sideways scrolling. `--photo` (a
photo of a tomato leaf with Tuta absoluta damage) adds the Leaf check and Ask suites, which use the live AI
and a little of the free quota; `--lan` adds the "phone on the Wi-Fi" check. Screenshots go to `browser-out/`.

## Phones on the same Wi-Fi (laptop fallback)

`npm run dev` already lets phones on a private network load the pages, and the demo's QR code points at the
laptop's Wi-Fi address by itself, even when you open the demo on `localhost`. Two more things are needed:

1. **Allow sign-in from those addresses.** In `.env.local` set `BETTER_AUTH_TRUSTED_ORIGINS` to your private
   ranges, for example `http://192.168.*.*:3000,http://10.*.*.*:3000`. A `*` matches one number; a 172 network
   needs one entry per range, `http://172.16.*.*:3000` … `http://172.31.*.*:3000`. Trust nothing wider.
   Without this, signing up from a phone fails with `Invalid origin`.
2. **Let Windows accept the connection.** The first time Node listens, Windows asks: choose *Allow access*,
   including on a "Public" Wi-Fi. If a phone still times out, the rule is missing (as administrator:
   `New-NetFirewallRule -DisplayName "Node" -Direction Inbound -Program "C:\Program Files\nodejs\node.exe" -Action Allow -Profile Private,Public`)
   or the venue's Wi-Fi isolates devices from each other. In that case join the laptop to a phone's hotspot.

For the pitch fallback use the production build: it is faster and has no development tools.

```powershell
npm run build
npm start                    # then open http://<laptop-ip>:3000 on the phones
```

Phones browsing plain `http://` cannot use *Use my location* (browsers require HTTPS), so they tap the map instead.
`node scripts/browser/lan-check.mjs http://<laptop-ip>:3000` shows the phone's view from the laptop itself
(it cannot test the Wi-Fi hardware, so do one real phone test too).

## Deploy (do this last)

1. `npx vercel login`, then `npx vercel link`.
2. In the Vercel dashboard: *Storage → Create → Turso* (free) and connect it to the project.
3. `npx vercel env pull .env.production.local --environment=production`, then
   `$env:ENV_FILE=".env.production.local"; npx drizzle-kit push` to create the tables on Turso.
4. Add the other variables in Vercel: `BETTER_AUTH_SECRET` (a **new** one), `BETTER_AUTH_URL`
   (`https://<project>.vercel.app`), `GEMINI_API_KEY`, optionally `GEMINI_API_KEY_DEMO`, `DEMO_ENTRY=1` and
   `DEMO_PASSWORD`. Do not set `BETTER_AUTH_TRUSTED_ORIGINS` there.
5. `npx vercel --prod`, then run all `smoke-*` scripts against the new URL.
6. Check the Derja voice from the server: it uses the unofficial Edge read-aloud service, which may refuse
   datacenter addresses. If so the *Listen* button falls back to the browser's own voice (set
   `TTS_VOICE_*` or move to Azure Speech for production).

## Data and credits

* Weather: [Open-Meteo](https://open-meteo.com) (CC BY 4.0) — forecast, ERA5 archive, geocoding
* Satellites: **JAXA Earth API** — GPM/GSMaP rain, GCOM-W/AMSR2 soil moisture, GCOM-C/SGLI land surface
  temperature and NDVI
* Maps: OpenStreetMap · Esri World Imagery · [Sentinel-2 cloudless](https://s2maps.eu) by EOX IT Services
  (contains modified Copernicus Sentinel data 2024, CC BY-NC-SA 4.0 — **non-commercial**)
* Method: FAO Irrigation & Drainage Paper 56
* AI: Google Gemini · Voice: Microsoft Edge neural voices (`ar-TN`, `ja-JP`, `en-GB`, `fr-FR`)

## Honest limits

* A water-balance **estimate**, not a measurement: it improves when the farmer logs watering and does the
  squeeze test. It is not a substitute for an agricultural adviser (the app says so, and never gives pesticide
  doses).
* Satellite values describe one pixel (2.2 km for temperature and greenness, about 9 km for rain and soil
  moisture), not the field. Soil moisture has no reading over water, so near the coast the nearest land pixel
  can be tens of km away; the Satellite tab shows that distance. Rain arrives about 5 days late, soil moisture 2.
* The free Gemini tier is shared and sometimes overloaded: answers come from a fast model first, with a
  second opinion only when it isn't confident, and clear errors when the quota is reached.
* No e-mail verification or password reset (there is no mail service).
* Arabic, Derja and Japanese texts should be reviewed by native speakers before real use.
