import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCoverRect,
  createSandParticles,
  particleFallAtProgress,
  particleLandingProgress,
} from "./home-sand-reveal.ts";

test("cover crop follows the same cover scale and focal position as object-fit", () => {
  const centered = calculateCoverRect(1600, 900, 300, 300);
  assert.ok(Math.abs(centered.width - 533.3333333333333) < 1e-9);
  assert.equal(centered.height, 300);
  assert.ok(Math.abs(centered.x - -116.66666666666666) < 1e-9);
  assert.equal(centered.y, 0);

  const focalCrop = calculateCoverRect(1200, 800, 400, 200, 0.5, 0.42);
  assert.equal(focalCrop.width, 400);
  assert.ok(Math.abs(focalCrop.height - 266.6666666666667) < 1e-9);
  assert.ok(Math.abs(focalCrop.y - -28) < 1e-9);
});

test("sand grains sample real photo colors and are deterministic, bounded, and fine", () => {
  const width = 80;
  const height = 40;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = x < width / 2 ? 24 : 190;
      pixels[offset + 1] = y < height / 2 ? 48 : 132;
      pixels[offset + 2] = 76;
      pixels[offset + 3] = 255;
    }
  }

  const first = createSandParticles(pixels, width, height, 7, 320);
  const second = createSandParticles(pixels, width, height, 7, 320);
  assert.equal(first.length, 320);
  assert.deepEqual(first, second);
  assert.ok(first.every((particle) => particle.x >= 0 && particle.x < width));
  assert.ok(first.every((particle) => particle.y >= 0 && particle.y < height));
  assert.ok(first.every((particle) => particle.startY < 0));
  assert.ok(first.every((particle) => particle.size >= 0.62 && particle.size <= 1.37));
  assert.ok(first.every((particle) => particle.fallStart >= 0 && particleLandingProgress(particle) <= 1));
  assert.ok(new Set(first.map((particle) => particle.color)).size >= 4);
});

test("grain motion accelerates downward, drifts gently, and settles at its sampled photo position", () => {
  const particle = {
    x: 40,
    y: 80,
    startX: 34,
    startY: -40,
    size: 1,
    aspect: 1,
    fallStart: 0.2,
    fallDuration: 0.4,
    driftX: 3,
    depositRadius: 2,
    color: "rgb(20 40 60)",
    kind: 0,
  };

  const before = particleFallAtProgress(particle, 0.1);
  const firstQuarter = particleFallAtProgress(particle, 0.3);
  const midpoint = particleFallAtProgress(particle, 0.4);
  const nearLanding = particleFallAtProgress(particle, 0.55);
  const landed = particleFallAtProgress(particle, 0.6);

  assert.equal(before.visible, false);
  assert.equal(before.landed, false);
  assert.ok(firstQuarter.y > particle.startY);
  assert.ok(midpoint.y > firstQuarter.y);
  assert.ok(nearLanding.y > midpoint.y);
  assert.ok(nearLanding.visible);
  assert.ok(Math.abs(midpoint.x - (particle.startX + (particle.x - particle.startX) * 0.25 + particle.driftX)) < 1e-9);
  assert.equal(landed.landed, true);
  assert.equal(landed.visible, false);
  assert.equal(landed.x, particle.x);
  assert.equal(landed.y, particle.y);
});

test("photo deposits are only eligible after falling completes, with a top-to-bottom arrival wave", () => {
  const width = 240;
  const height = 180;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  const particles = createSandParticles(pixels, width, height, 32, 5_400);
  const top = particles.filter((particle) => particle.y < height * 0.2);
  const middle = particles.filter((particle) => particle.y > height * 0.4 && particle.y < height * 0.6);
  const bottom = particles.filter((particle) => particle.y > height * 0.8);
  const meanLanding = (items) => items.reduce((total, particle) => total + particleLandingProgress(particle), 0) / items.length;

  assert.equal(particles.length, 5_400);
  assert.ok(top.length > 0 && middle.length > 0 && bottom.length > 0);
  assert.ok(meanLanding(top) < meanLanding(middle));
  assert.ok(meanLanding(middle) < meanLanding(bottom));

  const particle = middle[0];
  const landing = particleLandingProgress(particle);
  assert.equal(particleFallAtProgress(particle, landing - 0.001).landed, false);
  assert.equal(particleFallAtProgress(particle, landing).landed, true);
});
