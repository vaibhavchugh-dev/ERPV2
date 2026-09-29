const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.85;
const RESIZE_THRESHOLD_BYTES = 1.5 * 1024 * 1024;
const PASSTHROUGH_TYPES = ["image/jpeg", "image/png", "image/webp"];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read image"));
    };
    img.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "photo";
  return `${base}.jpg`;
}

/**
 * Downscales large camera photos and re-encodes non-web formats (e.g. HEIC on
 * browsers that can decode it) as JPEG. GIFs are left alone to keep animation.
 * Returns the original file if the browser cannot decode it.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (file.type === "image/gif") return file;
  if (PASSTHROUGH_TYPES.includes(file.type) && file.size <= RESIZE_THRESHOLD_BYTES) {
    return file;
  }

  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToJpeg(canvas);
    if (!blob) return file;
    if (PASSTHROUGH_TYPES.includes(file.type) && blob.size >= file.size) return file;

    return new File([blob], jpegName(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
