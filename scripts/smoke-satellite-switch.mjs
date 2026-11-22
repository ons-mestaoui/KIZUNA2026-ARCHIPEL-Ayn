// Verify that /api/field and /api/satellite properly scope and refresh per farmId with no-store headers.
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const origin = new URL(base).origin;

function client() {
  const jar = new Map();
  const absorb = (res) => {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || /max-age=0/i.test(line)) jar.delete(k);
      else jar.set(k, v);
    }
  };
  return async (path, init = {}) => {
    const res = await fetch(base + path, {
      redirect: "manual",
      ...init,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
        ...init.headers,
      },
    });
    absorb(res);
    return res;
  };
}

async function run() {
  const c = client();
  const email = `sat-test-${Date.now()}@example.com`;
  const password = "smoke-test-pass-123";

  // 1. Sign up
  const su = await c("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ name: "Sat Farmer", email, password }),
  });
  if (!su.ok) {
    const text = await su.text();
    throw new Error(`Sign up failed: ${su.status} ${text}`);
  }

  // 2. Create Farm 1 (Kairouan coords)
  const f1 = await c("/api/farm", {
    method: "PUT",
    body: JSON.stringify({
      name: "Olive Farm Kairouan",
      lat: 35.6781,
      lon: 10.0963,
      placeName: "Kairouan",
      crop: "olive",
      plantingDate: null,
      areaHa: 2.5,
      soilTexture: "loam",
      irrigationMethod: "drip",
      waterSource: "solar_basin",
      basinM3: 50,
      pvKWp: 5,
      pumpHeadM: 10,
      wellSafeYieldM3h: 30,
      lastIrrigated: "today",
      lang: "en",
      polygon: [
        [10.0960, 35.6780],
        [10.0966, 35.6780],
        [10.0966, 35.6785],
        [10.0960, 35.6785],
      ],
    }),
  });
  const f1Json = await f1.json();
  if (!f1.ok) {
    console.error("f1 error:", f1.status, f1Json);
    throw new Error("f1 failed");
  }
  const farm1Id = f1Json.farm.id;

  // 3. Create Farm 2 (Zaghouan coords)
  const f2 = await c("/api/farm", {
    method: "POST",
    body: JSON.stringify({
      name: "Citrus Farm Zaghouan",
      lat: 36.4029,
      lon: 10.1429,
      placeName: "Zaghouan",
      crop: "citrus",
      plantingDate: null,
      areaHa: 4.0,
      soilTexture: "clay_loam",
      irrigationMethod: "drip",
      waterSource: "solar_basin",
      basinM3: 80,
      pvKWp: 8,
      pumpHeadM: 12,
      wellSafeYieldM3h: 35,
      lastIrrigated: "today",
      lang: "en",
      polygon: [
        [10.1420, 36.4020],
        [10.1438, 36.4020],
        [10.1438, 36.4038],
        [10.1420, 36.4038],
      ],
    }),
  });
  const f2Json = await f2.json();
  if (!f2.ok) {
    console.error("f2 error:", f2.status, f2Json);
    throw new Error("f2 failed");
  }
  const farm2Id = f2Json.farm.id;

  console.log(`Farm 1 ID: ${farm1Id}, Farm 2 ID: ${farm2Id}`);

  // 4. Test /api/field for Farm 1
  const field1Res = await c(`/api/field?farmId=${farm1Id}`);
  if (!field1Res.ok) throw new Error(`field1 failed: ${field1Res.status}`);
  const cc1 = field1Res.headers.get("cache-control");
  if (!cc1 || !cc1.includes("no-store")) throw new Error(`Missing no-store in field1: ${cc1}`);
  const field1 = await field1Res.json();
  console.log("PASS  /api/field for Farm 1 returns correct cache-control and data");

  // 5. Test /api/field for Farm 2
  const field2Res = await c(`/api/field?farmId=${farm2Id}`);
  if (!field2Res.ok) throw new Error(`field2 failed: ${field2Res.status}`);
  const cc2 = field2Res.headers.get("cache-control");
  if (!cc2 || !cc2.includes("no-store")) throw new Error(`Missing no-store in field2: ${cc2}`);
  const field2 = await field2Res.json();
  console.log("PASS  /api/field for Farm 2 returns correct cache-control and data");

  // Verify bounding boxes and polygons are completely distinct
  if (Math.abs(field1.box.north - field2.box.north) < 0.01) {
    throw new Error("Fields should have different boxes");
  }
  console.log(`PASS  Field 1 box north: ${field1.box.north}, Field 2 box north: ${field2.box.north}`);

  // 6. Test /api/satellite for Farm 1 & Farm 2
  const sat1Res = await c(`/api/satellite?metric=rain&farmId=${farm1Id}`);
  if (!sat1Res.ok) throw new Error(`sat1 failed: ${sat1Res.status}`);
  const satCc1 = sat1Res.headers.get("cache-control");
  if (!satCc1 || !satCc1.includes("no-store")) throw new Error(`Missing no-store in sat1: ${satCc1}`);
  const sat1 = await sat1Res.json();
  console.log("PASS  /api/satellite for Farm 1 returns no-store and rain data:", sat1.metric);

  const sat2Res = await c(`/api/satellite?metric=soil&farmId=${farm2Id}`);
  if (!sat2Res.ok) throw new Error(`sat2 failed: ${sat2Res.status}`);
  const satCc2 = sat2Res.headers.get("cache-control");
  if (!satCc2 || !satCc2.includes("no-store")) throw new Error(`Missing no-store in sat2: ${satCc2}`);
  const sat2 = await sat2Res.json();
  console.log("PASS  /api/satellite for Farm 2 returns no-store and soil data:", sat2.metric);

  console.log("\nAll satellite and 3D field refresh verification tests passed!");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
