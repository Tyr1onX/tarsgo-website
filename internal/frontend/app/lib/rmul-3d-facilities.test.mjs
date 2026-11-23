import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FACILITIES } from "./rmul-3d-facilities.ts";

test("the on-site 3D geometry is byte-for-byte identical to uploaded rmul_2027.stl", () => {
  const path = new URL("../../../../public/assets/pixel-jijia/rmul_2027.stl", import.meta.url);
  const buffer = readFileSync(path);
  assert.equal(buffer.length, 190634);
  assert.equal(buffer.readUInt32LE(80), 3811);
  const objectHash = createHash("sha1")
    .update(Buffer.from(`blob ${buffer.length}\0`))
    .update(buffer)
    .digest("hex");
  assert.equal(objectHash, "4b35550ad7fc552ed76479ef01a7529b2598bd38");
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 3811; i++) {
    for (let vertex = 0; vertex < 3; vertex++) {
      const offset = 84 + i * 50 + 12 + vertex * 12;
      for (let axis = 0; axis < 3; axis++) {
        const value = buffer.readFloatLE(offset + axis * 4);
        low[axis] = Math.min(low[axis], value);
        high[axis] = Math.max(high[axis], value);
      }
    }
  }
  assert.deepEqual(low, [0, 0, 0]);
  assert.deepEqual(high, [12600, 520, 8600]);
});

test("both teams have one base, outpost and energy landmark with unique IDs", () => {
  assert.equal(FACILITIES.length, 6);
  assert.equal(new Set(FACILITIES.map((f) => f.id)).size, 6);
  for (const team of ["red", "blue"]) {
    const landmarks = FACILITIES.filter((f) => f.team === team);
    assert.deepEqual(landmarks.map((f) => f.kind), ["base", "outpost", "energy"]);
    assert.ok(landmarks.every((f) => f.x > 0 && f.x < 12.6 && f.z > 0 && f.z < 8.6));
    assert.ok(landmarks.every((f) => f.y >= 0 && f.y <= 0.52));
  }
  assert.ok(FACILITIES.find((f) => f.id === "red-base").x < 6.3);
  assert.ok(FACILITIES.find((f) => f.id === "blue-base").x > 6.3);
});
