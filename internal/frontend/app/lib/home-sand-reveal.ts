export type SandParticle = {
  x: number;
  y: number;
  startX: number;
  startY: number;
  size: number;
  aspect: number;
  delay: number;
  color: string;
  kind: 0 | 1 | 2;
};

export function calculateCoverRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  objectPositionX = 0.5,
  objectPositionY = 0.5,
) {
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    x: (targetWidth - width) * clamp(objectPositionX, 0, 1),
    y: (targetHeight - height) * clamp(objectPositionY, 0, 1),
    width,
    height,
  };
}

export function createSandParticles(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  seed = 1,
  maxParticles = 1_200,
): SandParticle[] {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4 || maxParticles <= 0) return [];

  const aspect = width / height;
  const columns = Math.max(1, Math.ceil(Math.sqrt(maxParticles * aspect)));
  const rows = Math.max(1, Math.ceil(maxParticles / columns));
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const random = createRandom(seed);
  const particles: SandParticle[] = [];

  for (let row = 0; row < rows && particles.length < maxParticles; row += 1) {
    for (let column = 0; column < columns && particles.length < maxParticles; column += 1) {
      const x = clamp((column + 0.5 + (random() - 0.5) * 0.62) * cellWidth, 0, width - 1);
      const y = clamp((row + 0.5 + (random() - 0.5) * 0.62) * cellHeight, 0, height - 1);
      const pixelOffset = (Math.floor(y) * width + Math.floor(x)) * 4;
      const red = pixels[pixelOffset] ?? 0;
      const green = pixels[pixelOffset + 1] ?? 0;
      const blue = pixels[pixelOffset + 2] ?? 0;
      const alpha = pixels[pixelOffset + 3] ?? 255;
      if (alpha < 20) continue;

      const tint = 0.035;
      const color = `rgb(${Math.round(red * (1 - tint) + 208 * tint)} ${Math.round(green * (1 - tint) + 173 * tint)} ${Math.round(blue * (1 - tint) + 105 * tint)})`;
      const coarseX = Math.floor(column / 4);
      const coarseY = Math.floor(row / 3);
      const island = coordinateNoise(seed, coarseX, coarseY);
      const luminance = sampleLuminance(pixels, width, height, Math.floor(x), Math.floor(y));
      const contrast = sampleContrast(pixels, width, height, Math.floor(x), Math.floor(y));
      const imagePriority = clamp(contrast * 1.35 + Math.abs(luminance - 0.46) * 0.55, 0, 1);
      const delay = clamp(0.04 + (1 - imagePriority) * 0.31 + island * 0.17 + random() * 0.14, 0.04, 0.68);

      particles.push({
        x,
        y,
        startX: x + (random() - 0.5) * Math.max(9, cellWidth * 3.2),
        startY: y - (0.25 + random() * 2.1) * cellHeight,
        size: 0.78 + random() * 1.38,
        aspect: 0.56 + random() * 1.3,
        delay,
        color,
        kind: Math.floor(random() * 3) as SandParticle["kind"],
      });
    }
  }

  return particles;
}

export function particleProgress(progress: number, delay: number) {
  const localProgress = clamp((progress - delay) / Math.max(0.001, 1 - delay), 0, 1);
  return 1 - (1 - localProgress) ** 3;
}

function createRandom(seed: number) {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function coordinateNoise(seed: number, x: number, y: number) {
  let value = (seed ^ Math.imul(x + 1, 0x45d9f3b) ^ Math.imul(y + 1, 0x119de1f3)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 4_294_967_295;
}

function sampleLuminance(pixels: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const offset = (clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1)) * 4;
  return ((pixels[offset] ?? 0) * 0.2126 + (pixels[offset + 1] ?? 0) * 0.7152 + (pixels[offset + 2] ?? 0) * 0.0722) / 255;
}

function sampleContrast(pixels: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const left = sampleLuminance(pixels, width, height, x - 1, y);
  const right = sampleLuminance(pixels, width, height, x + 1, y);
  const top = sampleLuminance(pixels, width, height, x, y - 1);
  const bottom = sampleLuminance(pixels, width, height, x, y + 1);
  return Math.min(1, Math.abs(left - right) + Math.abs(top - bottom));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
