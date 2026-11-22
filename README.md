# Ayn (عين · アイン), formerly Goutte d'Or AI

*Ayn* is Arabic for both an **eye** and a **spring of water**: the satellite looking at the land, and the water that feeds it.
The name lives in one file, `lib/brand.ts` (plus the translated sentences in `lib/i18n`), so it can change again in minutes.
`DEMO_EMAIL` (`demo@goutte-dor.app`), the `gd-*` saved-state keys and the folder name keep the old name on purpose: renaming them would
break seeded accounts and saved state.

Know exactly when to water your farm — from the weather, the satellites and your solar pump.
Built for the **Kizuna hackathon (Tunisia × Japan)** · theme: water, energy, agriculture.

A farmer signs in, drops a pin on the farm, answers four short questions (crop, water source, soil,
last watering) and gets:

| | |
|---|---|
| **Today** | Water or not, how many m³, and *when* — with the farmer's **own field in 3D, seen from space** (zones, greenness, leaf water) or the digital twin of the water system |
| **Week** | A 7-day plan; every day assumes the farmer followed the one before |
| **Leaf check** | A photo of a sick leaf → likely cause, safe actions, honest confidence, spoken aloud |
| **Ask** | A chat in Arabic (Tunisian Derja), French, Japanese or English, with optional photo and voice |
| **Satellite** | The field's own pass-by-pass history (Sentinel-2, 10 m) above rain, soil moisture, ground temperature and greenness from JAXA satellites |

The interface is in **English, العربية (RTL) and 日本語**; the AI answers in whatever language the farmer writes.

## The front page

`/` is a static landing page (`components/landing/`): a nav bar built for keyboards and screen readers (skip link, scroll-spy,
a modal menu on phones), a hero where the golden drop sits in an eye that **opens as you scroll** onto drone footage, a
"Watch it work" dialog, one day at the orchard (the app's own recording), the app on a phone in the visitor's language,
what the app can and cannot tell you, and the team. It is trilingual (English, Arabic right-to-left, Japanese), respects
"reduce motion" (nothing pinned, nothing autoplays) and keeps the pitch mode hidden: no text or link on `/` mentions it.

* Media is local, so it works offline. `public/media`: the hero is a free stock drone clip (*Aerial View of Olive Groves at
  Sunrise*, Maciej Chojnacki, Pexels licence; credited in the footer), re-encoded to a 4 MB 1080p loop with a seamless
  dissolve (`node scripts/media/hero.mjs <the 4K original>`; the original is not kept in the repository). The day loop and the
  tour are recordings of the real app: `node scripts/media/record.mjs` (frames, 3D headless) then `node scripts/media/encode.mjs`
  (ffmpeg). The phone screens: `node scripts/media/screens.mjs`. The team portraits: `node scripts/media/portraits.mjs`.
* `npm test` checks every media file exists and fits the budget, and that the colour tokens keep text readable (WCAG AA) and
  the focus ring visible on every surface.
* `node scripts/browser/landing.mjs <base> <outDir> <en|ar|ja> <phone|desktop>` checks layout, the hidden doors, the keyboard and
  reduced motion; `scripts/browser/scroll-perf.mjs` times the scroll (`GPU=1` uses the real graphics card).
* Motion across the app (`components/motion/Motion.tsx`): tab content eases in, a bar slides between tabs, onboarding steps
  ease in, main buttons lift and press. Only transform and opacity move, and `reduce motion` turns movement into a fade.

## The watering forecast (Week tab)

The seven-day plan is a forecast card (`components/farmer/WeekTab.tsx`, logic in `forecast.ts`): a sky painted in code that follows the
chosen day's weather (calm, warm, hot, stormy; `node scripts/media/skies.mjs` regenerates them), the water to give in big light
type, frosted-glass panels for the day's plan, the soil water and the weather, and a wave through the week (the water left in the
root zone) that you tap, drag along or move through with the arrow keys. Each sky has a visible sun (with a halo and soft rays) and a bank of cumulus in front that drifts very slowly. On a phone the card is tall; on a desktop it spreads across the page (the Week tab is allowed the full width) with landscape skies (`-wide`). Motion is one soft entrance, a spring on the marker and a
260 ms text swap; nothing loops, and "reduce motion" removes the movement. `node scripts/browser/week.mjs <base> <outDir> <lang> <phone|desktop>` checks it.

## Your field from space

The farmer **outlines their field on the map** (tap the corners, or start from a square of N hectares). The app
then shows that field in 3D: the real photo, the boundary as a gold wall, the world around it veiled, and the
satellite data on top. The field is a **floating island**: the real ground on top, a craggy rock body tapering below it, rocks
drifting around it and clouds underneath (`components/field/island.ts`, `Clouds.tsx`). The farm's kit (solar modules on
racks, pump house, well, basin with rippling water, or a diesel generator) is modelled in `components/field/models.tsx`.

* **Data:** Sentinel-2 L2A through the free [Copernicus Data Space](https://dataspace.copernicus.eu) account
  (the app asks for NDVI and NDMI at 10 m, one clear pass and one about two weeks earlier), photo tiles from
  Esri World Imagery shown with attribution, terrain heights from open Terrarium tiles. The server only
  downloads a history of passes and two small index pictures per field, cached for hours (`lib/server/field.ts`).
* **Layers:** *Zones* (the field split into 2–4 patches that behave differently, named A, B, C from the
  north-west), *Greenness* (NDVI), *Leaf water* (NDMI), *Photo*. Colours are built in OKLCH with even lightness
  steps; the zone scale (amber ↔ grey ↔ teal) is tested to stay readable for red-green colour-blind readers.
* **Advice, in rules not AI** (`lib/field/advice.ts`): *"Water zone B first"* only when the plan says to water
  today **and** the zone is low on both greenness and leaf water; otherwise *"Check zone B first"*. The plan
  still decides how much water; the card only orders where it goes. When the zone looked the same on the earlier
  pass it says so (thin canopy, young trees or a sandy patch, not new thirst).
* **What it can't tell:** greenness and leaf water come from 10 m pixels (1 ha ≈ 100 pixels, under 0.25 ha
  there are no zones). They show where plants look different, **not how much water is in the soil**. Clouds
  hide the field for days; the view shows the date of the newest usable pass.
* **Get the keys (free):** sign in at dataspace.copernicus.eu, open the Sentinel Hub dashboard
  (shapps.dataspace.copernicus.eu/dashboard) → *User settings* → *OAuth clients* → *Create*, and put the client id
  and secret in `.env.local` as `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET`. The secret is shown once. Without
  them the field view says the satellite could not be reached and everything else keeps working.

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
| `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET` | Copernicus Data Space OAuth client (free), for the satellite view of the farmer's field. Server only, never `NEXT_PUBLIC_`. Hourly request cap built in (`lib/server/copernicus.ts`) |
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

The demo opens on the **real field view**: a 1 ha orchard block about 1.4 km north-west of the centre of Menzel Bouzelfa (the demo farm's crop is citrus), seen
by Sentinel-2 on **18 and 23 July 2026** (before and after the heatwave; *Today's forecast* switches to the
two latest passes). The soil sensor is drawn as a pin inside the healthiest zone ("one sensor sees one spot, the
satellite sees every zone") and the zone card follows the plan: on the dry heatwave day it says *Water zone C
first*, after you pour water it only says *Check zone C first*. The change between the two July passes is small
and noisy (citrus is evergreen); the strength of the demo is the **zones inside the field**, which repeat on
every date. The field is exactly 1 ha so the pitch's numbers (80 m³ basin, 3 kWp, the savings) are unchanged.

Beside the field stands the farm's **kit**: solar panels, pump house, well and storage basin (a diesel generator on a
diesel farm), joined by pipes to drip lines across the field. It follows the day clock under the view: press **Play**
and the sun rises, the pump starts, the basin fills and the water runs out along the drip lines into the field. The
pad is **drawn for illustration** (the farmer never says where the equipment stands, and no real farm with a mapped
pump and panels was found near the demo; OpenStreetMap only has a factory roof and three reservoirs there), and is
labelled so on screen. It is left out for fields over 400 m across.

The satellite data of the demo is **bundled** (`data/demo/field.json`, `public/demo/field-photo.jpg`), so the
demo never calls Copernicus. To refresh it (needs the `CDSE_*` keys): `npm run snapshot:field`.

## If the Wi-Fi misbehaves during the pitch

* **Saved answers.** Start the server with `DEMO_OFFLINE=1` and the demo account answers the Leaf check and
  Ask from saved content in English, Arabic and Japanese, without calling Gemini. Every such answer carries a
  *Saved demo answer* label, so nobody mistakes it for the live AI. Check it with
  `node scripts/smoke-offline.mjs <url>`.
* **Works with no internet at all:** the 3D twin, the plan, the virtual soil sensor and the heatwave day. They
  run on weather snapshots bundled with the app. So does the demo's **field view**: zones, terrain, the card and
  the sensor pin come from the bundle; only the crisp Esri photo needs internet, and without it the ground
  falls back to the softer bundled Sentinel-2 picture (checked in the browser with every outside request refused).
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
npm test                                   # 200+ unit tests: the engine, plus the field maths (geometry, zones, advice, colours, tiles, terrain, the Copernicus client with a mocked network)
node scripts/smoke-auth.mjs  <url> --deep  # sign-up / sign-in / sign-out, guarded pages, database + live Gemini / voice / JAXA / Copernicus
node scripts/smoke-farm.mjs  <url>         # farm API, 7-day plan, logging, isolation between farmers
node scripts/smoke-field.mjs <url>         # field outline rules, the live Sentinel-2 payload, privacy between farmers, no secrets in responses
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

They sign up, onboard (including drawing a field outline by tapping the map), read the plan, turn the 3D field
and press the buttons on a phone-sized touch screen and on a desktop, in English, Arabic (right to left) and
Japanese, and fail on console errors or sideways scrolling. The field suites also check that today's decision
stays above the fold, that a saved copy of the view shows with no signal, and that sign-out removes it. `--photo` (a
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
   `DEMO_PASSWORD`, and **`CDSE_CLIENT_ID` / `CDSE_CLIENT_SECRET`** for the satellite field view (make a fresh
   OAuth client for production, and delete the one used while building). Do not set
   `BETTER_AUTH_TRUSTED_ORIGINS` there. The database needs the `farm.polygon` column: step 3's `drizzle-kit push`
   adds it (run it again after any schema change).
5. `npx vercel --prod`, then run all `smoke-*` scripts against the new URL.
6. Check the Derja voice from the server: it uses the unofficial Edge read-aloud service, which may refuse
   datacenter addresses. If so the *Listen* button falls back to the browser's own voice (set
   `TTS_VOICE_*` or move to Azure Speech for production).

## Data and credits

* Weather: [Open-Meteo](https://open-meteo.com) (CC BY 4.0) — forecast, ERA5 archive, geocoding
* Satellites: **JAXA Earth API** — GPM/GSMaP rain, GCOM-W/AMSR2 soil moisture, GCOM-C/SGLI land surface
  temperature and NDVI
* Satellite field view: **Copernicus Sentinel-2 L2A** (contains modified Copernicus Sentinel data 2026) through the
  [Copernicus Data Space Ecosystem](https://dataspace.copernicus.eu), free and open
* Maps: OpenStreetMap · Esri World Imagery (tiles © Esri, Maxar, Earthstar Geographics, shown live with
  attribution, never copied into the repository) · [Sentinel-2 cloudless](https://s2maps.eu) by EOX IT Services
  (contains modified Copernicus Sentinel data 2024, CC BY-NC-SA 4.0 — **non-commercial**)
* Terrain: [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) (Mapzen / Tilezen; built from
  SRTM, ASTER and other open elevation data — see their attribution page)
* Landing-page hero footage: *Aerial View of Olive Groves at Sunrise* by Maciej Chojnacki, [Pexels](https://www.pexels.com/video/aerial-view-of-olive-groves-at-sunrise-29615503/) (Pexels licence: free for commercial use, no credit required)
* Method: FAO Irrigation & Drainage Paper 56
* AI: Google Gemini · Voice: Microsoft Edge neural voices (`ar-TN`, `ja-JP`, `en-GB`, `fr-FR`)

## Honest limits

* A water-balance **estimate**, not a measurement: it improves when the farmer logs watering and does the
  squeeze test. It is not a substitute for an agricultural adviser (the app says so, and never gives pesticide
  doses).
* The **field view** is Sentinel-2 at 10 m: good for telling patches of one field apart, not for single rows or
  trees. Greenness and leaf water are not soil moisture, and a weak zone can simply be young trees, gaps or
  weeds (the card says so and asks the farmer to look). The terrain is a 30 m model, exaggerated to read at this
  scale (the exaggeration is printed on the picture). Esri's photo is current imagery of varying age and sharpness;
  where it has none at a zoom the app falls back to a coarser one.
* The other satellite cards describe one pixel (2.2 km for temperature and greenness, about 9 km for rain and soil
  moisture), not the field. Soil moisture has no reading over water, so near the coast the nearest land pixel
  can be tens of km away; the Satellite tab shows that distance. Rain arrives about 5 days late, soil moisture 2.
* The free Gemini tier is shared and sometimes overloaded: answers come from a fast model first, with a
  second opinion only when it isn't confident, and clear errors when the quota is reached.
* No e-mail verification or password reset (there is no mail service).
* Arabic, Derja and Japanese texts should be reviewed by native speakers before real use.
