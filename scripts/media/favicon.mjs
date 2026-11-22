// Builds app/favicon.ico (16, 32 and 48 px, PNG inside) from app/icon.svg.   node scripts/media/favicon.mjs
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
const svg = readFileSync("app/icon.svg");
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((n) => sharp(svg, { density: 384 }).resize(n, n).png().toBuffer()));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = head.length;
sizes.forEach((n, i) => {
  const e = 6 + i * 16;
  head.writeUInt8(n, e); head.writeUInt8(n, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(off, e + 12);
  off += pngs[i].length;
});
writeFileSync("app/favicon.ico", Buffer.concat([head, ...pngs]));
console.log("favicon.ico written", off, "bytes");
