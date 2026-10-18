import {
  encodeCoordinateSandBits,
  getCoordinateSandPosition,
  gijiaBaseCoordinate,
} from "~/lib/about-coordinate-sand";
import "./footer-coordinate-sand-trace.css";

const coordinateTraceBits = encodeCoordinateSandBits(gijiaBaseCoordinate);

export function FooterCoordinateSandTrace() {
  return (
    <span className="footer-coordinate-sand-trace" aria-hidden="true">
      {coordinateTraceBits.split("").map((bit, index) => {
        const position = getCoordinateSandPosition(index);
        return (
          <span
            className="footer-coordinate-sand-trace__grain"
            data-bit={bit}
            style={{ left: `${position.x}%`, top: `${position.y}%`, rotate: `${position.rotation}deg` }}
            key={index}
          />
        );
      })}
    </span>
  );
}
