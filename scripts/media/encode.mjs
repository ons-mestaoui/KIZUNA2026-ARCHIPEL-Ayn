// Turns the captured frames (browser-out/media/<clip>/NNNN.jpg) into the files the landing page plays (public/media/).
//   node scripts/media/encode.mjs            needs ffmpeg on PATH
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const IN = "browser-out/media";
const OUT = "public/media";
mkdirSync(OUT, { recursive: true });
const FPS = 24;

/**
 * The headless 3D renderer drops its graphics context now and then while capturing at 2x: that gives a blank frame and
 * resets the camera to the wide view. So: skip the frames before the first reset, repeat the previous frame over any blank
 * one, and crop the wide view in on the field (its middle) so it fills the picture.
 */
async function clean(name, { skip = 0, crop } = {}) {
  const src = `${IN}/${name}`;
  const dst = `${IN}/${name}-clean`;
  mkdirSync(dst, { recursive: true });
  const files = readdirSync(src).filter((f) => f.endsWith(".jpg")).sort().slice(skip);
  let last = null;
  let blanks = 0;
  for (const [i, f] of files.entries()) {
    const img = sharp(`${src}/${f}`);
    const stdev = (await img.clone().greyscale().stats()).channels[0].stdev;
    let buf = last;
    if (stdev >= 8 || !last) {
      const shaped = crop ? img.extract(crop).resize(1280, 800) : img;
      buf = await shaped.jpeg({ quality: 90 }).toBuffer();
      last = buf;
    } else blanks++;
    await sharp(buf).toFile(`${dst}/${String(i).padStart(4, "0")}.jpg`);
  }
  console.log(`${name}: ${files.length} frames, ${blanks} blank ones repeated`);
}

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
}
const seq = (name) => ["-framerate", String(FPS), "-i", `${IN}/${name}/%04d.jpg`];
const H264 = ["-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"];
const VP9 = ["-c:v", "libvpx-vp9", "-crf", "37", "-b:v", "0", "-row-mt", "1", "-pix_fmt", "yuv420p", "-an"];

function encode(name, filter, inputs) {
  const f = filter ? ["-filter_complex", filter, "-map", "[v]"] : [];
  ffmpeg([...inputs, ...f, ...H264, `${OUT}/${name}.mp4`]);
  ffmpeg([...inputs, ...f, ...VP9, `${OUT}/${name}.webm`]);
}
const poster = (name, clip, at = 0) => sharp(`${IN}/${clip}/${String(at).padStart(4, "0")}.jpg`).webp({ quality: 82 }).toFile(`${OUT}/${name}-poster.webp`);

await clean("orbit");
await clean("day", { skip: 8, crop: { left: 230, top: 50, width: 800, height: 500 } });

// (the hero is a stock drone clip: see scripts/media/hero.mjs)
// one day, dawn to dusk
encode("day", null, seq("day-clean"));
await poster("day", "day-clean", 90);
// the dialog's tour: the orbit once, then the day
encode("tour", "[0:v][1:v]concat=n=2:v=1[v]", [...seq("orbit-clean"), ...seq("day-clean")]);
await poster("tour", "orbit-clean", 40);

for (const f of ["day", "tour"]) {
  for (const ext of [".mp4", ".webm", "-poster.webp"]) {
    const p = `${OUT}/${f}${ext}`;
    console.log(p.padEnd(34), (statSync(p).size / 1024 / 1024).toFixed(2), "MB");
  }
}
