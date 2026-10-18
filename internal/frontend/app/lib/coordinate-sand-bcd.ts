export type Coordinate = {
  longitude: number;
  latitude: number;
};

export type CoordinateSandBcd = {
  longitude: string;
  latitude: string;
  longitudeHemisphere: "E" | "W";
  latitudeHemisphere: "N" | "S";
};

export const gijiaBaseCoordinate: Coordinate = {
  longitude: 125.2852,
  latitude: 43.8468,
};

export const coordinateBcdFormat = {
  bitsPerDigit: 4,
  decimalDigits: 4,
  longitudeIntegerDigits: 3,
  latitudeIntegerDigits: 2,
  longitudeBitCount: 28,
  latitudeBitCount: 24,
} as const;

const longitudeGrainCount = coordinateBcdFormat.longitudeBitCount;
const latitudeGrainCount = coordinateBcdFormat.latitudeBitCount;

function bitNoise(index: number, salt: number): number {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}

export type CoordinateSandVariation = {
  offsetY: number;
  rotation: number;
};

/** A small deterministic drift keeps the deposit organic without changing bit order. */
export function getCoordinateSandVariation(
  index: number,
  row: "longitude" | "latitude",
): CoordinateSandVariation {
  const grainCount = row === "longitude" ? longitudeGrainCount : latitudeGrainCount;
  if (!Number.isInteger(index) || index < 0 || index >= grainCount) {
    throw new RangeError(`coordinate sand bit index must be between 0 and ${grainCount - 1}`);
  }

  const seed = index + (row === "latitude" ? longitudeGrainCount + 1 : 0);
  return {
    offsetY: Number((Math.sin((index + 1) * 0.57) * 0.65 + (bitNoise(seed, 0) - 0.5) * 0.45).toFixed(2)),
    rotation: Number(((bitNoise(seed, 1) - 0.5) * 14).toFixed(2)),
  };
}

function coordinateDigits(value: number, limit: number, integerDigits: number, axis: string): string {
  if (!Number.isFinite(value) || Math.abs(value) > limit) {
    throw new RangeError(`${axis} is outside the valid coordinate range`);
  }

  const rounded = Math.round(Math.abs(value) * 10 ** coordinateBcdFormat.decimalDigits);
  if (Math.abs(Math.abs(value) - rounded / 10 ** coordinateBcdFormat.decimalDigits) > 1e-8) {
    throw new RangeError(`${axis} must use at most ${coordinateBcdFormat.decimalDigits} decimal places`);
  }

  const [integerPart, decimalPart] = (rounded / 10 ** coordinateBcdFormat.decimalDigits)
    .toFixed(coordinateBcdFormat.decimalDigits)
    .split(".");
  return integerPart.padStart(integerDigits, "0") + decimalPart;
}

function encodeDigitsAsBcd(digits: string): string {
  return [...digits].map((digit) => Number(digit).toString(2).padStart(coordinateBcdFormat.bitsPerDigit, "0")).join("");
}

export function encodeCoordinateBcd(coordinate: Coordinate): CoordinateSandBcd {
  const longitudeDigits = coordinateDigits(
    coordinate.longitude,
    180,
    coordinateBcdFormat.longitudeIntegerDigits,
    "longitude",
  );
  const latitudeDigits = coordinateDigits(
    coordinate.latitude,
    90,
    coordinateBcdFormat.latitudeIntegerDigits,
    "latitude",
  );
  const encoded: CoordinateSandBcd = {
    longitude: encodeDigitsAsBcd(longitudeDigits),
    latitude: encodeDigitsAsBcd(latitudeDigits),
    longitudeHemisphere: coordinate.longitude < 0 ? "W" : "E",
    latitudeHemisphere: coordinate.latitude < 0 ? "S" : "N",
  };

  if (encoded.longitude.length !== coordinateBcdFormat.longitudeBitCount
    || encoded.latitude.length !== coordinateBcdFormat.latitudeBitCount) {
    throw new Error("coordinate BCD format has an invalid width");
  }
  return encoded;
}

function decodeBcdDigits(bits: string, expectedWidth: number, axis: string): string {
  if (!new RegExp(`^[01]{${expectedWidth}}$`).test(bits)) {
    throw new RangeError(`${axis} BCD row must contain exactly ${expectedWidth} binary grains`);
  }

  let digits = "";
  for (let index = 0; index < bits.length; index += coordinateBcdFormat.bitsPerDigit) {
    const digit = Number.parseInt(bits.slice(index, index + coordinateBcdFormat.bitsPerDigit), 2);
    if (digit > 9) {
      throw new RangeError(`${axis} BCD row contains a non-decimal digit`);
    }
    digits += String(digit);
  }
  return digits;
}

export function decodeCoordinateBcd(encoded: CoordinateSandBcd): Coordinate {
  if (encoded.longitudeHemisphere !== "E" && encoded.longitudeHemisphere !== "W") {
    throw new RangeError("longitude hemisphere must be E or W");
  }
  if (encoded.latitudeHemisphere !== "N" && encoded.latitudeHemisphere !== "S") {
    throw new RangeError("latitude hemisphere must be N or S");
  }

  const longitudeDigits = decodeBcdDigits(encoded.longitude, coordinateBcdFormat.longitudeBitCount, "longitude");
  const latitudeDigits = decodeBcdDigits(encoded.latitude, coordinateBcdFormat.latitudeBitCount, "latitude");
  const longitude = Number(`${longitudeDigits.slice(0, coordinateBcdFormat.longitudeIntegerDigits)}.${longitudeDigits.slice(coordinateBcdFormat.longitudeIntegerDigits)}`);
  const latitude = Number(`${latitudeDigits.slice(0, coordinateBcdFormat.latitudeIntegerDigits)}.${latitudeDigits.slice(coordinateBcdFormat.latitudeIntegerDigits)}`);

  if (longitude > 180 || latitude > 90) {
    throw new RangeError("coordinate BCD row decodes outside the valid coordinate range");
  }
  return {
    longitude: encoded.longitudeHemisphere === "W" ? -longitude : longitude,
    latitude: encoded.latitudeHemisphere === "S" ? -latitude : latitude,
  };
}
