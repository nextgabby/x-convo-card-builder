export function parseAspectRatio(str) {
  if (!str) return null;
  const parts = String(str).split(':').map(Number);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { w: parts[0], h: parts[1], value: parts[0] / parts[1] };
}

export function isCompatibleRatio(aspectRatio, requiredRatio, tolerance = 0.01) {
  if (!requiredRatio || !aspectRatio) return true;
  const required = parseAspectRatio(requiredRatio);
  const actual = parseAspectRatio(aspectRatio);
  if (!required || !actual) return true;
  return Math.abs(actual.value - required.value) < tolerance;
}

export function ratioLabel(ratio) {
  if (ratio === '1:1') return '1:1';
  if (ratio === '191:100') return '1.91:1';
  if (ratio === '16:9') return '16:9';
  return ratio || '';
}

export function minSizeForRatio(ratio) {
  if (ratio === '1:1') return { minWidth: 800, minHeight: 800 };
  if (ratio === '16:9') return { minWidth: 800, minHeight: 450 };
  return { minWidth: 800, minHeight: 418 };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}

export async function cropImageFile(file, requiredAspectRatio) {
  const required = parseAspectRatio(requiredAspectRatio);
  if (!required || !file) return file;

  const src = URL.createObjectURL(file);
  try {
    const img = await loadImage(src);
    const { minWidth, minHeight } = minSizeForRatio(requiredAspectRatio);
    const actual = img.width / img.height;

    let sx = 0;
    let sy = 0;
    let sw = img.width;
    let sh = img.height;
    if (actual > required.value) {
      sw = Math.round(img.height * required.value);
      sx = Math.round((img.width - sw) / 2);
    } else if (actual < required.value) {
      sh = Math.round(img.width / required.value);
      sy = Math.round((img.height - sh) / 2);
    }

    if (Math.min(sw, sh) < 400) {
      throw new Error(
        `Image too small to crop to ${ratioLabel(requiredAspectRatio)} (${img.width}×${img.height}).`
      );
    }

    const alreadyFits =
      Math.abs(actual - required.value) < 0.005 &&
      img.width >= minWidth &&
      img.height >= minHeight;
    if (alreadyFits) return file;

    let dw = sw;
    let dh = sh;
    if (dw < minWidth || dh < minHeight) {
      const scale = Math.max(minWidth / dw, minHeight / dh);
      dw = Math.round(dw * scale);
      dh = Math.round(dh * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not crop image'))),
        mime,
        0.92
      );
    });
    const ext = mime === 'image/png' ? '.png' : '.jpg';
    const base = (file.name || 'image').replace(/\.[^.]+$/, '');
    return new File([blob], `${base}${ext}`, { type: mime });
  } finally {
    URL.revokeObjectURL(src);
  }
}

export async function recropImageFromUrl(url, requiredAspectRatio) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('Could not load image to crop');
  const blob = await res.blob();
  const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  const file = new File([blob], 'image.jpg', { type });
  const cropped = await cropImageFile(file, requiredAspectRatio);
  return { file: cropped, changed: cropped !== file };
}
