// The Figma mask and hero video share a 1920 × 1080 canvas and a centred cover crop.
export function homeLogoMaskRect(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  const scale = Math.max(rect.width / 1920, rect.height / 1080);
  const width = 1920 * scale;
  const height = 1080 * scale;
  return {
    width,
    height,
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
  };
}

// Treat the SVG's editable stdDeviation as CSS pixels at every cover scale.
export function homeLogoMaskImage(image: string, renderedWidth: number) {
  if (renderedWidth <= 0) return image;
  return image.replace(
    /(stdDeviation(?:%3D|=)(?:%22|%27|'))([\d.]+)/i,
    (_, prefix: string, feather: string) => `${prefix}${Number(feather) * 1920 / renderedWidth}`
  );
}
