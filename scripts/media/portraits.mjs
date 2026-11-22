// Team portraits: square, face-centred crops of the originals, written to public/team/*.webp.
//   node scripts/media/portraits.mjs [sourceDir]
// The crops (left, top, size) are in the source's own pixels; they were chosen by eye so every face sits at the same height.
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const src = process.argv[2] ?? "C:/Users/user/Desktop/imgs";
const out = "public/team";
mkdirSync(out, { recursive: true });
const PEOPLE = [
  { file: "amine.png", slug: "amine", crop: { left: 0, top: 5, width: 401, height: 401 } },
  { file: "rayen.jpg", slug: "rayen", crop: { left: 200, top: 20, width: 640, height: 640 } },
  { file: "ons.png", slug: "ons", crop: { left: 20, top: 0, width: 321, height: 321 } },
  { file: "outheila.png", slug: "outhaila", crop: { left: 12, top: 6, width: 376, height: 376 } },
];
for (const p of PEOPLE) {
  const info = await sharp(`${src}/${p.file}`)
    .rotate()
    .extract(p.crop)
    .resize(640, 640, { kernel: "lanczos3" })
    .webp({ quality: 84 })
    .toFile(`${out}/${p.slug}.webp`);
  console.log(p.slug, info.width + "x" + info.height, Math.round(info.size / 1024) + " KB");
}
