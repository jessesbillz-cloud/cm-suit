// An SVG logo as a PNG (migration 0110): the logo bucket takes PNG or JPEG only, so an SVG never sits in storage (it can
// carry script) and every server-made PDF can embed the logo. Drawn through an <img>, which never runs an SVG's scripts,
// onto a canvas with its longest edge at LOGO_EDGE (vector art stays sharp when scaled up). Browser only.

const LOGO_EDGE = 1200;

/** The size the PNG is drawn at: the SVG's own shape (300 x 150, the browser's default, when it has none). */
export function svgCanvasSize(width: number, height: number): { width: number; height: number } {
  const w = width > 0 ? width : 300;
  const h = height > 0 ? height : 150;
  const scale = LOGO_EDGE / Math.max(w, h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

export async function svgToPng(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error('That SVG could not be read.');
    });
    const size = svgCanvasSize(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser could not convert the SVG.');
    ctx.drawImage(img, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('This browser could not convert the SVG.'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
