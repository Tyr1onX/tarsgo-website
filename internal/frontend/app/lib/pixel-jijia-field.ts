// Overhead projection of the user-provided rmul_2027.stl.
// STL axes: X = horizontal, Z = vertical on this canvas, Y = elevation.
// Source bounds: 12600 × 8600 × 520 model units; STL does not encode units.
// Raised regions are treated as solid in this first 2D training version.
export const FIELD_WIDTH = 900;
export const FIELD_HEIGHT = 614;
export const FIELD_INSET = 300 * FIELD_WIDTH / 12600;

export type Point = { x: number; y: number };
export type Obstacle = {
  kind: "platform" | "guard";
  points: Point[];
  bounds: { x: number; y: number; width: number; height: number };
};

const scaled = (points: number[][]) => points.map(([x, z]) => ({
  x: x * FIELD_WIDTH / 12600,
  y: z * FIELD_HEIGHT / 8600,
}));

function obstacle(kind: Obstacle["kind"], coords: number[][]): Obstacle {
  const points = scaled(coords);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { kind, points, bounds: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y } };
}

// Top-facing mesh triangles unioned by level. These are physical raised footprints,
// not hand-placed rectangles or invented game obstacles.
export const OBSTACLES: readonly Obstacle[] = [
  obstacle("platform", [
    [4800, 4200], [4800, 3300], [2800, 3300], [2800, 7280],
    [2938.56, 7360], [3625, 7360], [3625, 8160], [2938.56, 8160],
    [2800, 8300], [4800, 8300], [4661.44, 8160], [3975, 8160],
    [3975, 7360], [4661.44, 7360], [4800, 7280], [4800, 6000],
    [4650, 6000], [4650, 4200],
  ]),
  obstacle("platform", [
    [7800, 300], [7938.56, 440], [8625, 440], [8625, 1240],
    [7938.56, 1240], [7800, 1320], [7800, 2600], [7950, 2600],
    [7950, 4400], [7800, 4400], [7800, 5300], [9800, 5300],
    [9800, 1320], [9661.44, 1240], [8975, 1240], [8975, 440],
    [9661.44, 440], [9800, 300],
  ]),
  obstacle("guard", [
    [300, 7900], [350, 7850], [1000, 7850], [1050, 7900],
    [1050, 8250], [1000, 8300], [300, 8300],
  ]),
  obstacle("guard", [
    [11550, 350], [11600, 300], [12300, 300], [12300, 700],
    [12250, 750], [11600, 750], [11550, 700],
  ]),
];

// Two higher strips are also present in the mesh, entirely inside the platforms.
// Keep them visual only because their parent platforms are already impassable.
export const HIGH_WALLS = [
  { x: 4650, z: 4200, width: 150, height: 1800 },
  { x: 7800, z: 2600, width: 150, height: 1800 },
].map((wall) => ({
  x: wall.x * FIELD_WIDTH / 12600,
  y: wall.z * FIELD_HEIGHT / 8600,
  width: wall.width * FIELD_WIDTH / 12600,
  height: wall.height * FIELD_HEIGHT / 8600,
}));
