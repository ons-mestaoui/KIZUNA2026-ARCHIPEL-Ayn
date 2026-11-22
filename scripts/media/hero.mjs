// The hero footage: a free stock drone clip, re-encoded small and made to loop without a visible seam.
//   node scripts/media/hero.mjs <source.mp4>
//
// Source: "Aerial View of Olive Groves at Sunrise", Maciej Chojnacki, Pexels (Pexels licence: free for commercial use,
// no credit required; credit is given in the page footer anyway). https://www.pexels.com/video/aerial-view-of-olive-groves-at-sunrise-29615503/
// The 4K original (77 MB) is not kept in the repository: only the 1080p loop below is.
import { statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const src = process.argv[2];
if (!src) throw new Error("usage: node scripts/media/hero.mjs <source.mp4>");
const OUT = "public/media";
const FADE = 1.2; // seconds of cross-dissolve at the loop point

const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src], { encoding: "utf8" });
const T = Number.parseFloat(probe.stdout);
if (!(T > 4)) throw new Error("could not read the clip length");

// head = first FADE s, mid = the middle, tail = last FADE s. The loop plays tail→head as a dissolve, then mid, and mid ends
// exactly where tail begins, so when the video restarts nothing jumps.
const filter = [
  `[0:v]fps=30,scale=1920:1080:flags=lanczos,split=3[a][b][c]`,
  `[a]trim=0:${FADE},setpts=PTS-STARTPTS[head]`,
  `[b]trim=${FADE}:${(T - FADE).toFixed(3)},setpts=PTS-STARTPTS[mid]`,
  `[c]trim=${(T - FADE).toFixed(3)}:${T.toFixed(3)},setpts=PTS-STARTPTS[tail]`,
  `[tail][head]xfade=transition=fade:duration=${FADE}:offset=0[x]`,
  `[x][mid]concat=n=2:v=1[v]`,
].join(";");

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-filter_complex", filter, "-map", "[v]", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed");
}
ffmpeg(["-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", `${OUT}/hero.mp4`]);
ffmpeg(["-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-row-mt", "1", "-pix_fmt", "yuv420p", "-an", `${OUT}/hero.webm`]);

// the poster is a frame from the middle of the clip
const png = `${OUT}/.hero-poster.png`;
spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", "3", "-i", `${OUT}/hero.mp4`, "-frames:v", "1", png], { stdio: "inherit" });
await sharp(png).webp({ quality: 80 }).toFile(`${OUT}/hero-poster.webp`);
spawnSync("node", ["-e", `require("fs").unlinkSync(${JSON.stringify(png)})`]);

for (const f of ["hero.mp4", "hero.webm", "hero-poster.webp"]) console.log(f.padEnd(18), (statSync(`${OUT}/${f}`).size / 1024 / 1024).toFixed(2), "MB");
