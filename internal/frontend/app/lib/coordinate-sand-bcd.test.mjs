import assert from "node:assert/strict";
import test from "node:test";
import {
  coordinateBcdFormat,
  decodeCoordinateBcd,
  encodeCoordinateBcd,
  getCoordinateSandVariation,
  gijiaBaseCoordinate,
} from "./coordinate-sand-bcd.ts";

test("the two footer traces use exactly 52 standard 8421 BCD bits and decode to the supplied coordinate", () => {
  const encoded = encodeCoordinateBcd(gijiaBaseCoordinate);

  assert.equal(encoded.longitude, "0001001001010010100001010010");
  assert.equal(encoded.latitude, "010000111000010001101000");
  assert.equal(encoded.longitude.length, coordinateBcdFormat.longitudeBitCount);
  assert.equal(encoded.latitude.length, coordinateBcdFormat.latitudeBitCount);
  assert.equal(encoded.longitude.length + encoded.latitude.length, 52);
  assert.deepEqual(decodeCoordinateBcd(encoded), gijiaBaseCoordinate);
  assert.equal(encoded.longitudeHemisphere, "E");
  assert.equal(encoded.latitudeHemisphere, "N");
});

test("each four-bit group is a valid decimal digit and hemisphere signs round-trip", () => {
  const encoded = encodeCoordinateBcd({ longitude: -73.9857, latitude: -40.9006 });

  for (const row of [encoded.longitude, encoded.latitude]) {
    for (let index = 0; index < row.length; index += 4) {
      assert.ok(Number.parseInt(row.slice(index, index + 4), 2) <= 9);
    }
  }
  assert.deepEqual(decodeCoordinateBcd(encoded), { longitude: -73.9857, latitude: -40.9006 });
  assert.equal(encoded.longitudeHemisphere, "W");
  assert.equal(encoded.latitudeHemisphere, "S");
});

test("the decoder rejects wrong widths, non-binary data, invalid BCD digits, and invalid hemispheres", () => {
  const encoded = encodeCoordinateBcd(gijiaBaseCoordinate);

  assert.throws(() => decodeCoordinateBcd({ ...encoded, longitude: encoded.longitude.slice(1) }), /exactly 28/);
  assert.throws(() => decodeCoordinateBcd({ ...encoded, latitude: `x${encoded.latitude.slice(1)}` }), /exactly 24/);
  assert.throws(() => decodeCoordinateBcd({ ...encoded, longitude: `1010${encoded.longitude.slice(4)}` }), /non-decimal digit/);
  assert.throws(() => decodeCoordinateBcd({ ...encoded, longitudeHemisphere: "Q" }), /hemisphere/);
});

test("the encoder rejects invalid coordinate ranges and precision beyond four decimals", () => {
  assert.throws(() => encodeCoordinateBcd({ longitude: 181, latitude: 0 }), /valid coordinate range/);
  assert.throws(() => encodeCoordinateBcd({ longitude: 0, latitude: -90.0001 }), /valid coordinate range/);
  assert.throws(() => encodeCoordinateBcd({ longitude: 1.23456, latitude: 0 }), /at most 4 decimal places/);
});

test("organic trace offsets are deterministic and remain small enough to preserve bit order", () => {
  for (const [row, count] of [["longitude", 28], ["latitude", 24]]) {
    const variations = Array.from({ length: count }, (_, index) => getCoordinateSandVariation(index, row));
    assert.deepEqual(variations, Array.from({ length: count }, (_, index) => getCoordinateSandVariation(index, row)));
    assert.ok(variations.every(({ offsetY, rotation }) => Math.abs(offsetY) < 1.1 && Math.abs(rotation) < 7));
  }
  assert.throws(() => getCoordinateSandVariation(28, "longitude"), /index/);
  assert.throws(() => getCoordinateSandVariation(-1, "latitude"), /index/);
});
