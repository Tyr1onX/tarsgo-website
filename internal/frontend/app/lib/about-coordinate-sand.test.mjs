import assert from "node:assert/strict";
import test from "node:test";
import {
  coordinateSandCode,
  decodeCoordinateSandBits,
  encodeCoordinateSandBits,
  formatCoordinateHemisphere,
  getCoordinateSandPosition,
  gijiaBaseCoordinate,
} from "./about-coordinate-sand.ts";

test("the visible 8-by-7 grain field reversibly encodes the supplied WGS84 coordinate", () => {
  const bits = encodeCoordinateSandBits(gijiaBaseCoordinate);

  assert.equal(bits.length, coordinateSandCode.columns * coordinateSandCode.rows);
  assert.equal(bits.slice(-1), "0", "the last grain cell is the fixed padding cell");
  assert.deepEqual(decodeCoordinateSandBits(bits), gijiaBaseCoordinate);
  assert.equal(formatCoordinateHemisphere(gijiaBaseCoordinate.longitude, "longitude"), "125.2852°E");
  assert.equal(formatCoordinateHemisphere(gijiaBaseCoordinate.latitude, "latitude"), "43.8468°N");
});

test("encoded grains use a deterministic irregular deposit instead of a visible grid", () => {
  const positions = Array.from({ length: coordinateSandCode.columns * coordinateSandCode.rows }, (_, index) =>
    getCoordinateSandPosition(index),
  );

  assert.equal(new Set(positions.map(({ x, y }) => `${x}:${y}`)).size, positions.length);
  assert.ok(positions.every(({ x, y, rotation }) => x > 0 && x < 100 && y > 0 && y < 100 && rotation >= 0 && rotation < 90));
  assert.notDeepEqual(positions[0], positions[1]);
  assert.throws(() => getCoordinateSandPosition(-1), /index/);
  assert.throws(() => getCoordinateSandPosition(56), /index/);
});

test("the signed fixed-point format round-trips coordinates on either side of zero", () => {
  const coordinate = { longitude: -73.9857, latitude: -40.9006 };
  assert.deepEqual(decodeCoordinateSandBits(encodeCoordinateSandBits(coordinate)), coordinate);
  assert.equal(formatCoordinateHemisphere(coordinate.longitude, "longitude"), "73.9857°W");
  assert.equal(formatCoordinateHemisphere(coordinate.latitude, "latitude"), "40.9006°S");
});

test("the decoder rejects damaged bits, unknown versions, invalid padding, and malformed widths", () => {
  const bits = encodeCoordinateSandBits(gijiaBaseCoordinate);
  const payloadBit = 4;
  const damagedPayload = `${bits.slice(0, payloadBit)}${bits[payloadBit] === "0" ? "1" : "0"}${bits.slice(payloadBit + 1)}`;
  const unknownVersion = `1${bits.slice(1)}`;
  const invalidPadding = `${bits.slice(0, -1)}1`;

  assert.throws(() => decodeCoordinateSandBits(damagedPayload), /checksum/);
  assert.throws(() => decodeCoordinateSandBits(unknownVersion), /version/);
  assert.throws(() => decodeCoordinateSandBits(invalidPadding), /padding/);
  assert.throws(() => decodeCoordinateSandBits(bits.slice(1)), /56 bits/);
});

test("the encoder rejects invalid ranges and coordinates requiring more than four decimals", () => {
  assert.throws(() => encodeCoordinateSandBits({ longitude: 181, latitude: 0 }), /valid coordinate range/);
  assert.throws(() => encodeCoordinateSandBits({ longitude: 0, latitude: 90.0001 }), /valid coordinate range/);
  assert.throws(() => encodeCoordinateSandBits({ longitude: 1.23456, latitude: 0 }), /at most 4 decimal places/);
});
