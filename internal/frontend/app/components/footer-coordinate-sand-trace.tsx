import {
  coordinateBcdFormat,
  encodeCoordinateBcd,
  getCoordinateSandVariation,
  gijiaBaseCoordinate,
} from "~/lib/coordinate-sand-bcd";
import "./footer-coordinate-sand-trace.css";

const encodedCoordinate = encodeCoordinateBcd(gijiaBaseCoordinate);

const particlePositions = {
  "0": [
    { x: 0.15, y: 0.8 },
    { x: 0.2, y: 0.85 },
    { x: 2, y: 0.05 },
    { x: 3.8, y: 1.2 },
  ],
  "1": [
    { x: 0.1, y: 0.05 },
    { x: 2.45, y: 0.15 },
    { x: 4.8, y: 0.05 },
    { x: 7.15, y: 0.2 },
    { x: 1, y: 1.95 },
    { x: 3.35, y: 2.1 },
    { x: 5.7, y: 2 },
    { x: 8.05, y: 2.15 },
  ],
} as const;

const decorativeGrains = [
  { x: 2, y: 2, size: 1.1 },
  { x: 8, y: 37, size: 1 },
  { x: 16, y: 4, size: 0.9 },
  { x: 24, y: 39, size: 1.2 },
  { x: 31, y: 2, size: 0.8 },
  { x: 38, y: 8, size: 1 },
  { x: 46, y: 40, size: 0.9 },
  { x: 53, y: 3, size: 1.2 },
  { x: 61, y: 35, size: 0.8 },
  { x: 68, y: 38, size: 1.1 },
  { x: 76, y: 2, size: 0.9 },
  { x: 84, y: 9, size: 1.1 },
  { x: 91, y: 39, size: 0.8 },
  { x: 98, y: 5, size: 1 },
];

function SandBcdRow({
  bits,
  row,
  integerDigits,
  hemisphere,
}: {
  bits: string;
  row: "longitude" | "latitude";
  integerDigits: number;
  hemisphere: string;
}) {
  const nibbles = Array.from(
    { length: bits.length / coordinateBcdFormat.bitsPerDigit },
    (_, index) => bits.slice(index * coordinateBcdFormat.bitsPerDigit, (index + 1) * coordinateBcdFormat.bitsPerDigit),
  );

  return (
    <span className={`footer-coordinate-sand-trace__row footer-coordinate-sand-trace__row--${row}`}>
      <span className="footer-coordinate-sand-trace__nibbles">
        {nibbles.map((nibble, nibbleIndex) => (
          <span
            className={`footer-coordinate-sand-trace__nibble${nibbleIndex === integerDigits ? " footer-coordinate-sand-trace__nibble--decimal-break" : ""}`}
            key={`${row}-nibble-${nibbleIndex}`}
          >
            {[...nibble].map((bit, bitIndex) => {
              const index = nibbleIndex * coordinateBcdFormat.bitsPerDigit + bitIndex;
              const variation = getCoordinateSandVariation(index, row);
              return (
                <span
                  className="footer-coordinate-sand-trace__bit"
                  data-bit={bit}
                  key={`${row}-bit-${index}`}
                  style={{ transform: `translateY(${variation.offsetY}px) rotate(${variation.rotation}deg)` }}
                >
                  {particlePositions[bit as "0" | "1"].map((position, particleIndex) => (
                    <i
                      className="footer-coordinate-sand-trace__particle"
                      key={`${row}-bit-${index}-grain-${particleIndex}`}
                      style={{ left: `${position.x}px`, top: `${position.y}px` }}
                    />
                  ))}
                </span>
              );
            })}
          </span>
        ))}
      </span>
      <span className="footer-coordinate-sand-trace__hemisphere">°{hemisphere}</span>
    </span>
  );
}

export function FooterCoordinateSandTrace() {
  return (
    <span className="footer-coordinate-sand-trace" aria-hidden="true">
      <span className="footer-coordinate-sand-trace__scattered-grains">
        {decorativeGrains.map((grain, index) => (
          <i
            className="footer-coordinate-sand-trace__scattered-grain"
            key={`scatter-${index}`}
            style={{ left: `${grain.x}%`, top: `${grain.y}px`, width: `${grain.size}px`, height: `${grain.size}px` }}
          />
        ))}
      </span>
      <SandBcdRow
        bits={encodedCoordinate.longitude}
        row="longitude"
        integerDigits={coordinateBcdFormat.longitudeIntegerDigits}
        hemisphere={encodedCoordinate.longitudeHemisphere}
      />
      <SandBcdRow
        bits={encodedCoordinate.latitude}
        row="latitude"
        integerDigits={coordinateBcdFormat.latitudeIntegerDigits}
        hemisphere={encodedCoordinate.latitudeHemisphere}
      />
    </span>
  );
}
