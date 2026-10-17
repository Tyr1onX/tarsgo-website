import assert from "node:assert/strict";
import test from "node:test";

import { calculateCoverRect, createSandParticles, particleProgress } from "./home-sand-reveal.ts";

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

test("sand particles sample real photo colors, stay bounded, and are repeatable", () => {
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
  assert.ok(first.every((particle) => particle.delay >= 0.04 && particle.delay <= 0.68));
  assert.ok(new Set(first.map((particle) => particle.color)).size >= 4);
});

test("particle reveal progress is smooth, monotonic, and clamped", () => {
  assert.equal(particleProgress(-1, 0.2), 0);
  assert.equal(particleProgress(0.1, 0.2), 0);
  assert.ok(particleProgress(0.5, 0.2) > 0);
  assert.ok(particleProgress(0.5, 0.2) < 1);
  assert.equal(particleProgress(1, 0.2), 1);
  assert.equal(particleProgress(2, 0.2), 1);
  assert.ok(particleProgress(0.4, 0.2) < particleProgress(0.6, 0.2));
});

test("high-contrast contours begin revealing ahead of flat image regions", () => {
  const width = 120;
  const height = 60;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = x < width / 2 ? 28 : 220;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }

  const particles = createSandParticles(pixels, width, height, 28, 900);
  const edgeParticles = particles.filter((particle) => particle.x >= 56 && particle.x <= 64);
  const flatParticles = particles.filter((particle) => particle.x <= 40 || particle.x >= 80);
  const average = (values) => values.reduce((total, particle) => total + particle.delay, 0) / values.length;
  assert.ok(edgeParticles.length > 0);
  assert.ok(average(edgeParticles) < average(flatParticles));
});
