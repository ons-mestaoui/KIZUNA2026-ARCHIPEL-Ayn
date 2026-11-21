// Client-side photo preparation: a 4000×3000 phone photo becomes a ~1024 px JPEG (a few hundred KB)
// before it leaves the phone — less mobile data, faster upload, fewer AI tokens.

export interface PreparedImage {
  image: string; // data-URL, longest side ≤ 1024 px
  thumb: string; // data-URL, longest side ≤ 160 px (kept in the history)
}

export type ImageError = "not_image" | "too_big" | "unreadable";

function toJpeg(bmp: ImageBitmap, maxSide: number, quality: number): string {
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("not_image" satisfies ImageError);
  if (file.size > 30 * 1024 * 1024) throw new Error("too_big" satisfies ImageError);
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); // honour the phone's rotation
    const out = { image: toJpeg(bmp, 1024, 0.82), thumb: toJpeg(bmp, 160, 0.7) };
    bmp.close();
    return out;
  } catch {
    throw new Error("unreadable" satisfies ImageError);
  }
}
