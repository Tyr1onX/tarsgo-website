export type SandParticle = {
  x: number;
  y: number;
  startX: number;
  startY: number;
  size: number;
  aspect: number;
  fallStart: number;
  fallDuration: number;
  driftX: number;
  depositRadius: number;
  color: string;
  kind: 0 | 1 | 2;
};

export type SandParticlePosition = {
  x: number;
  y: number;
  fallProgress: number;
  landed: boolean;
  visible: boolean;
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
  maxParticles = 5_400,
): SandParticle[] {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4 || maxParticles <= 0) return [];

  const aspect = width / height;
  const columns = Math.max(1, Math.ceil(Math.sqrt(maxParticles * aspect)));
  const rows = Math.max(1, Math.ceil(maxParticles / columns));
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const depositRadius = Math.max(1, Math.min(cellWidth, cellHeight) * 0.46);
  const random = createRandom(seed);
  const particles: SandParticle[] = [];

  for (let row = 0; row < rows && particles.length < maxParticles; row += 1) {
    for (let column = 0; column < columns && particles.length < maxParticles; column += 1) {
      const x = clamp((column + 0.5 + (random() - 0.5) * 0.72) * cellWidth, 0, width - 1);
      const y = clamp((row + 0.5 + (random() - 0.5) * 0.72) * cellHeight, 0, height - 1);
      const pixelOffset = (Math.floor(y) * width + Math.floor(x)) * 4;
      const red = pixels[pixelOffset] ?? 0;
      const green = pixels[pixelOffset + 1] ?? 0;
      const blue = pixels[pixelOffset + 2] ?? 0;
      const alpha = pixels[pixelOffset + 3] ?? 255;
      if (alpha < 20) continue;

      const coarseX = Math.floor(column / 5);
      const coarseY = Math.floor(row / 4);
      const islandNoise = (coordinateNoise(seed, coarseX, coarseY) - 0.5) * 0.12;
      const rowNoise = (random() - 0.5) * 0.15;
      const landAt = clamp(0.16 + (y / height) * 0.68 + islandNoise + rowNoise, 0.04, 0.98);
      const fallDuration = 0.2 + random() * 0.15;
      const fallStart = Math.max(0, landAt - fallDuration);

      particles.push({
        x,
        y,
        startX: x + (random() - 0.5) * Math.max(4, cellWidth * 1.8),
        startY: -height * (0.14 + random() * 0.5),
        size: 0.62 + random() * 0.75,
        aspect: 0.6 + random() * 1.2,
        fallStart,
        fallDuration,
        driftX: (random() - 0.5) * Math.min(7, cellWidth * 1.8),
        depositRadius,
        color: `rgb(${red} ${green} ${blue})`,
        kind: Math.floor(random() * 3) as SandParticle["kind"],
      });
    }
  }

  return particles;
}

export function particleLandingProgress(particle: SandParticle) {
  return particle.fallStart + particle.fallDuration;
}

export function particleFallAtProgress(particle: SandParticle, progress: number): SandParticlePosition {
  const landed = progress >= particleLandingProgress(particle) - 1e-9;
  const fallProgress = landed
    ? 1
    : clamp((progress - particle.fallStart) / Math.max(0.001, particle.fallDuration), 0, 1);
  const gravityProgress = fallProgress * fallProgress;
  const x = particle.startX + (particle.x - particle.startX) * gravityProgress + Math.sin(fallProgress * Math.PI) * particle.driftX;
  const y = particle.startY + (particle.y - particle.startY) * gravityProgress;

  return {
    x,
    y,
    fallProgress,
    landed,
    visible: fallProgress > 0 && !landed && y >= 0,
  };
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
