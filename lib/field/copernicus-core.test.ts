import { writeArrayBuffer } from "geotiff";
import { describe, expect, it, vi } from "vitest";
import { CdseError, createCdseClient } from "./copernicus-core";
import { squareFromArea } from "./geo";
import type { LonLat } from "./types";

const SECRET = "s3cr3t-value-that-must-never-leak";
const ID = "sh-test-client-id";
const creds = { id: ID, secret: SECRET };
const here: LonLat = [10.573, 36.687];

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
const tokenReply = () => json({ access_token: "tok-abc", expires_in: 1800, token_type: "Bearer" });

/** A fake network: the first matching handler wins; every request is recorded. */
function net(handlers: ((url: string, init: RequestInit) => Response | undefined)[]) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    seen.push({ url, init });
    for (const h of handlers) {
      const r = h(url, init);
      if (r) return r;
    }
    return new Response("no handler", { status: 599 });
  });
  return { fn: fn as unknown as typeof fetch, seen };
}
const isToken = (u: string) => u.includes("/token");
const noSleep = async () => {};

describe("token", () => {
  it("signs in once and reuses the token until it is nearly expired", async () => {
    let clock = 0;
    const n = net([(u) => (isToken(u) ? tokenReply() : undefined), (u) => (u.endsWith("/statistics") ? json({ data: [] }) : undefined)]);
    const c = createCdseClient(creds, { fetch: n.fn, now: () => clock, sleep: noSleep });
    const poly = squareFromArea(here, 1);
    await c.series(poly, new Date("2026-11-01"), new Date("2026-11-20"));
    await c.series(poly, new Date("2026-11-01"), new Date("2026-11-20"));
    expect(n.seen.filter((s) => isToken(s.url))).toHaveLength(1);
    clock += 1_750_000; // 1750 s of a 1800 s token: inside the 60 s safety margin
    await c.series(poly, new Date("2026-11-01"), new Date("2026-11-20"));
    expect(n.seen.filter((s) => isToken(s.url))).toHaveLength(2);
  });

  it("shares one sign-in between requests that start together", async () => {
    const n = net([(u) => (isToken(u) ? tokenReply() : undefined), (u) => (u.endsWith("/statistics") ? json({ data: [] }) : undefined)]);
    const c = createCdseClient(creds, { fetch: n.fn, sleep: noSleep });
    const poly = squareFromArea(here, 1);
    await Promise.all([1, 2, 3].map(() => c.series(poly, new Date("2026-11-01"), new Date("2026-11-20"))));
    expect(n.seen.filter((s) => isToken(s.url))).toHaveLength(1);
  });

  it("sends the credentials only to the sign-in address, never to the data API", async () => {
    const n = net([(u) => (isToken(u) ? tokenReply() : undefined), (u) => (u.endsWith("/statistics") ? json({ data: [] }) : undefined)]);
    await createCdseClient(creds, { fetch: n.fn, sleep: noSleep }).series(squareFromArea(here, 1), new Date("2026-11-01"), new Date("2026-11-20"));
    const api = n.seen.find((s) => s.url.endsWith("/statistics"))!;
    expect(String(api.init.body)).not.toContain(SECRET);
    expect(JSON.stringify(api.init.headers)).not.toContain(SECRET);
    expect(new Headers(api.init.headers).get("authorization")).toBe("Bearer tok-abc");
  });
});

describe("series", () => {
  it("asks for whole UTC days even when called late in the evening (the API cuts days from the 'from' time)", async () => {
    const n = net([(u) => (isToken(u) ? tokenReply() : undefined), (u) => (u.endsWith("/statistics") ? json({ data: [] }) : undefined)]);
    const c = createCdseClient(creds, { fetch: n.fn, sleep: noSleep });
    await c.series(squareFromArea(here, 1), new Date("2026-09-07T22:30:00Z"), new Date("2026-11-22T22:30:00Z"));
    const body = JSON.parse(String(n.seen.find((s) => s.url.endsWith("/statistics"))!.init.body));
    expect(body.aggregation.timeRange).toEqual({ from: "2026-09-07T00:00:00Z", to: "2026-11-23T00:00:00Z" }); // the whole of 22 Nov is included
    expect(body.aggregation.aggregationInterval).toEqual({ of: "P1D" });
  });

  it("sends a closed, counter-clockwise ring whichever way round the farmer drew it", async () => {
    const n = net([(u) => (isToken(u) ? tokenReply() : undefined), (u) => (u.endsWith("/statistics") ? json({ data: [] }) : undefined)]);
    const c = createCdseClient(creds, { fetch: n.fn, sleep: noSleep });
    const sq = squareFromArea(here, 1); // NW, NE, SE, SW = clockwise
    await c.series(sq, new Date("2026-11-01"), new Date("2026-11-20"));
    const ring = JSON.parse(String(n.seen.find((s) => s.url.endsWith("/statistics"))!.init.body)).input.bounds.geometry.coordinates[0] as LonLat[];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    let a = 0;
    for (let i = 0; i < 4; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    expect(a).toBeGreaterThan(0); // counter-clockwise
  });

  it("turns the API rows into points: clouded days have no value, 'NaN' strings are not numbers", async () => {
    const row = (day: string, mean: unknown, samples: number, nodata: number) => ({
      interval: { from: `${day}T00:00:00Z`, to: `${day}T23:59:59Z` },
      outputs: { ndvi: { bands: { B0: { stats: { mean, sampleCount: samples, noDataCount: nodata } } } }, ndmi: { bands: { B0: { stats: { mean: 0.21, sampleCount: samples, noDataCount: nodata } } } } },
    });
    const n = net([(u) => (isToken(u) ? tokenReply() : undefined), (u) => (u.endsWith("/statistics") ? json({ data: [row("2026-11-15", 0.62, 100, 0), row("2026-11-10", "NaN", 100, 100), row("2026-11-12", 0.5, 100, 40), row("2026-11-13", 0.5, 0, 0)] }) : undefined)]);
    const out = await createCdseClient(creds, { fetch: n.fn, sleep: noSleep }).series(squareFromArea(here, 1), new Date("2026-11-01"), new Date("2026-11-20"));
    expect(out.map((p) => p.date)).toEqual(["2026-11-10", "2026-11-12", "2026-11-15"]); // sorted; the empty-sample row is dropped
    expect(out[0]).toEqual({ date: "2026-11-10", ndvi: null, ndmi: null, clear: 0 });
    expect(out[1].clear).toBe(0.6);
    expect(out[2]).toEqual({ date: "2026-11-15", ndvi: 0.62, ndmi: 0.21, clear: 1 });
  });
});

describe("raster", () => {
  it("returns NaN for every pixel that is cloud, shadow, water or outside the swath", async () => {
    // 4 pixels × 4 bands: [ndvi, ndmi, scl, dataMask]
    const px = [
      [0.8, 0.3, 4, 1], // vegetation: kept
      [0.7, 0.2, 9, 1], // cloud (high probability): dropped
      [0.2, 0.0, 5, 1], // bare soil: kept
      [0.6, 0.2, 4, 0], // no data: dropped
    ].flat();
    const tiff = await writeArrayBuffer(new Float32Array(px), { width: 2, height: 2, SamplesPerPixel: 4, BitsPerSample: [32, 32, 32, 32], SampleFormat: [3, 3, 3, 3], PhotometricInterpretation: 1, PlanarConfiguration: 1 });
    const n = net([(u) => (isToken(u) ? tokenReply() : undefined), (u) => (u.endsWith("/process") ? new Response(tiff, { status: 200 }) : undefined)]);
    const r = await createCdseClient(creds, { fetch: n.fn, sleep: noSleep }).raster({ west: 10.5, south: 36.6, east: 10.6, north: 36.7 }, "2026-11-15", 2, 2);
    expect(Array.from(r.ndvi).map((v) => (Number.isNaN(v) ? null : +v.toFixed(2)))).toEqual([0.8, null, 0.2, null]);
    expect(Array.from(r.ndmi).map((v) => (Number.isNaN(v) ? null : +v.toFixed(2)))).toEqual([0.3, null, 0, null]);
    const sent = JSON.parse(String(n.seen.find((s) => s.url.endsWith("/process"))!.init.body));
    expect(sent.input.data[0].dataFilter.timeRange).toEqual({ from: "2026-11-15T00:00:00Z", to: "2026-11-15T23:59:59Z" });
    expect(sent.output).toMatchObject({ width: 2, height: 2 });
  });

  it("refuses a picture of the wrong size instead of misplacing every pixel", async () => {
    const tiff = await writeArrayBuffer(new Float32Array(4), { width: 1, height: 1, SamplesPerPixel: 4, BitsPerSample: [32, 32, 32, 32], SampleFormat: [3, 3, 3, 3], PhotometricInterpretation: 1, PlanarConfiguration: 1 });
    const n = net([(u) => (isToken(u) ? tokenReply() : undefined), (u) => (u.endsWith("/process") ? new Response(tiff, { status: 200 }) : undefined)]);
    await expect(createCdseClient(creds, { fetch: n.fn, sleep: noSleep }).raster({ west: 10.5, south: 36.6, east: 10.6, north: 36.7 }, "2026-11-15", 2, 2)).rejects.toThrow(/expected 2×2/);
  });
});

describe("errors and retries", () => {
  it("retries a rate-limited request and then succeeds", async () => {
    let tries = 0;
    const n = net([
      (u) => (isToken(u) ? tokenReply() : undefined),
      (u) => {
        if (!u.endsWith("/statistics")) return undefined;
        return ++tries < 3 ? new Response("slow down", { status: 429, headers: { "retry-after": "1" } }) : json({ data: [] });
      },
    ]);
    const sleeps: number[] = [];
    const c = createCdseClient(creds, { fetch: n.fn, sleep: async (ms) => void sleeps.push(ms) });
    await expect(c.series(squareFromArea(here, 1), new Date("2026-11-01"), new Date("2026-11-20"))).resolves.toEqual([]);
    expect(tries).toBe(3);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it("gives up after the retries and reports a quota problem", async () => {
    const n = net([(u) => (isToken(u) ? tokenReply() : undefined), () => new Response("limit", { status: 429 })]);
    const err = await createCdseClient(creds, { fetch: n.fn, sleep: noSleep }).series(squareFromArea(here, 1), new Date("2026-11-01"), new Date("2026-11-20")).catch((e) => e);
    expect(err).toBeInstanceOf(CdseError);
    expect(err.kind).toBe("quota");
  });

  it("signs in again once if the token is refused, then continues", async () => {
    let signIns = 0;
    let calls = 0;
    const n = net([
      (u) => (isToken(u) ? (signIns++, json({ access_token: `tok-${signIns}`, expires_in: 1800 })) : undefined),
      (u, init) => (u.endsWith("/statistics") ? (++calls === 1 ? new Response("expired", { status: 401 }) : new Headers(init.headers).get("authorization") === "Bearer tok-2" ? json({ data: [] }) : new Response("stale", { status: 401 })) : undefined),
    ]);
    await expect(createCdseClient(creds, { fetch: n.fn, sleep: noSleep }).series(squareFromArea(here, 1), new Date("2026-11-01"), new Date("2026-11-20"))).resolves.toEqual([]);
    expect(signIns).toBe(2);
  });

  it("a wrong secret is reported as an auth problem", async () => {
    const n = net([(u) => (isToken(u) ? new Response(JSON.stringify({ error: "unauthorized_client" }), { status: 401 }) : undefined)]);
    const err = await createCdseClient(creds, { fetch: n.fn, sleep: noSleep }).series(squareFromArea(here, 1), new Date("2026-11-01"), new Date("2026-11-20")).catch((e) => e);
    expect(err.kind).toBe("auth");
    expect(String(err.message)).not.toContain(SECRET);
  });

  it("never lets the secret, the id or a bearer token into an error message", async () => {
    const n = net([(u) => (isToken(u) ? tokenReply() : undefined), () => new Response(`bad request for client ${ID} with ${SECRET} Authorization: Bearer tok-abc`, { status: 400 })]);
    const err = await createCdseClient(creds, { fetch: n.fn, sleep: noSleep }).series(squareFromArea(here, 1), new Date("2026-11-01"), new Date("2026-11-20")).catch((e) => e);
    expect(err.kind).toBe("bad_request");
    for (const secret of [SECRET, ID, "tok-abc"]) expect(String(err.message)).not.toContain(secret);
  });

  it("a network failure becomes a CdseError, not a raw TypeError", async () => {
    const fn = vi.fn(async () => {
      throw new TypeError(`fetch failed (while sending ${SECRET})`);
    }) as unknown as typeof fetch;
    const err = await createCdseClient(creds, { fetch: fn, sleep: noSleep }).series(squareFromArea(here, 1), new Date("2026-11-01"), new Date("2026-11-20")).catch((e) => e);
    expect(err).toBeInstanceOf(CdseError);
    expect(err.kind).toBe("network");
    expect(String(err.message)).not.toContain(SECRET);
  });

  it("runs the hook before every request so the server can cap how many we make", async () => {
    const n = net([(u) => (isToken(u) ? tokenReply() : undefined), (u) => (u.endsWith("/statistics") ? json({ data: [] }) : undefined)]);
    let allowed = 1;
    const c = createCdseClient(creds, {
      fetch: n.fn,
      sleep: noSleep,
      beforeCall: () => {
        if (allowed-- <= 0) throw new CdseError("quota", "hourly budget used");
      },
    });
    const poly = squareFromArea(here, 1);
    await c.series(poly, new Date("2026-11-01"), new Date("2026-11-20"));
    await expect(c.series(poly, new Date("2026-11-01"), new Date("2026-11-20"))).rejects.toMatchObject({ kind: "quota" });
  });
});
