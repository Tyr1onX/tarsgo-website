export type Coordinate = {
  longitude: number;
  latitude: number;
};

export const gijiaBaseCoordinate: Coordinate = {
  longitude: 125.2852,
  latitude: 43.8468,
};

export const coordinateSandCode = {
  columns: 8,
  rows: 7,
  precision: 4,
} as const;

const SAND_GRAIN_COUNT = coordinateSandCode.columns * coordinateSandCode.rows;

function grainNoise(index: number, salt: number): number {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}

export type CoordinateSandPosition = {
  x: number;
  y: number;
  rotation: number;
};

/** Place each encoded bit as a grain in an irregular, low-profile dust deposit. */
export function getCoordinateSandPosition(index: number): CoordinateSandPosition {
  if (!Number.isInteger(index) || index < 0 || index >= SAND_GRAIN_COUNT) {
    throw new RangeError(`coordinate sand position index must be between 0 and ${SAND_GRAIN_COUNT - 1}`);
  }

  const x = 6 + grainNoise(index, 0) * 88;
  const y = 18 + (1 - (1 - grainNoise(index, 1)) ** 1.45) * 68;

  return {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    rotation: Number((grainNoise(index, 2) * 90).toFixed(2)),
  };
}

const SCALE = 10 ** coordinateSandCode.precision;
const VERSION = "0001";
const LONGITUDE_WIDTH = 22;
const LATITUDE_WIDTH = 21;
const CRC_WIDTH = 8;
const PAYLOAD_WIDTH = VERSION.length + LONGITUDE_WIDTH + LATITUDE_WIDTH;
const CODE_WIDTH = SAND_GRAIN_COUNT;

function toScaledCoordinate(value: number, limit: number, name: string): number {
  if (!Number.isFinite(value) || value < -limit || value > limit) {
    throw new RangeError(`${name} is outside the valid coordinate range`);
  }

  const scaled = Math.round(value * SCALE);
  if (Math.abs(value - scaled / SCALE) > 1e-8) {
    throw new RangeError(`${name} must use at most ${coordinateSandCode.precision} decimal places`);
  }
  return scaled;
}

function toTwosComplement(value: number, width: number): string {
  const bitWidth = BigInt(width);
  const min = -(1n << (bitWidth - 1n));
  const max = (1n << (bitWidth - 1n)) - 1n;
  const integer = BigInt(value);
  if (integer < min || integer > max) {
    throw new RangeError("coordinate does not fit the sand code format");
  }
  return BigInt.asUintN(width, integer).toString(2).padStart(width, "0");
}

function fromTwosComplement(bits: string): number {
  const width = BigInt(bits.length);
  const unsigned = BigInt(`0b${bits}`);
  const signBit = 1n << (width - 1n);
  const signed = (unsigned & signBit) === 0n ? unsigned : unsigned - (1n << width);
  return Number(signed);
}

function crc8(bits: string): string {
  let crc = 0;
  for (const bit of bits) {
    const feedback = ((crc >>> 7) & 1) ^ Number(bit);
    crc = (crc << 1) & 0xff;
    if (feedback) crc ^= 0x07;
  }
  return crc.toString(2).padStart(CRC_WIDTH, "0");
}

export function encodeCoordinateSandBits(coordinate: Coordinate): string {
  const longitude = toScaledCoordinate(coordinate.longitude, 180, "longitude");
  const latitude = toScaledCoordinate(coordinate.latitude, 90, "latitude");
  const payload = VERSION
    + toTwosComplement(longitude, LONGITUDE_WIDTH)
    + toTwosComplement(latitude, LATITUDE_WIDTH);
  const code = payload + crc8(payload) + "0";

  if (code.length !== CODE_WIDTH) {
    throw new Error("coordinate sand code format has an invalid width");
  }
  return code;
}

export function decodeCoordinateSandBits(bits: string): Coordinate {
  if (!/^[01]+$/.test(bits) || bits.length !== CODE_WIDTH) {
    throw new RangeError(`coordinate sand code must contain ${CODE_WIDTH} bits`);
  }
  if (bits.slice(0, VERSION.length) !== VERSION) {
    throw new RangeError("unsupported coordinate sand code version");
  }
  if (bits.at(-1) !== "0") {
    throw new RangeError("coordinate sand code has invalid padding");
  }

  const payload = bits.slice(0, PAYLOAD_WIDTH);
  const checksum = bits.slice(PAYLOAD_WIDTH, PAYLOAD_WIDTH + CRC_WIDTH);
  if (crc8(payload) !== checksum) {
    throw new RangeError("coordinate sand code checksum does not match");
  }

  const longitudeStart = VERSION.length;
  const latitudeStart = longitudeStart + LONGITUDE_WIDTH;
  const longitude = fromTwosComplement(bits.slice(longitudeStart, latitudeStart)) / SCALE;
  const latitude = fromTwosComplement(bits.slice(latitudeStart, PAYLOAD_WIDTH)) / SCALE;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new RangeError("coordinate sand code decodes outside the valid coordinate range");
  }

  return { longitude, latitude };
}

export function formatCoordinateHemisphere(value: number, axis: "latitude" | "longitude"): string {
  const hemisphere = axis === "longitude"
    ? (value < 0 ? "W" : "E")
    : (value < 0 ? "S" : "N");
  return `${Math.abs(value).toFixed(coordinateSandCode.precision)}°${hemisphere}`;
}
