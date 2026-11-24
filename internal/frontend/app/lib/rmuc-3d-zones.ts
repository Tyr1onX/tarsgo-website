import type { Team } from "./rmuc-3d-mechanisms.ts";

export type ZoneKind = "base" | "fortress" | "outpost" | "central" | "supply" | "assembly";
export type ZoneId = `${Team}-${ZoneKind}`;
export type ArenaPosition = { x:number; y:number; z:number };
type Point = readonly [number,number];
type ZoneShape = { kind:ZoneKind; polygon:readonly Point[]; height:readonly [number,number]; goal:Point };

// Rulebook V1.0.0 Fig. 5-23, projected onto the existing 28 x 15 m
// playable coordinate system. Calibrated against the actual GLB base,
// fortress, outpost footing and resource area. The published diagram does
// not give surveyed RFID boundaries: these polygons are geometric estimates,
// not certified card coverage. Keep them separate from the referee rules.
const RED_SHAPES:readonly ZoneShape[] = [
  {kind:"base",polygon:[[13.19,1.01],[11.73,1.99],[9.78,.89],[9.78,-.98],[11.73,-2.02],[13.19,-1.04]],height:[.15,.52],goal:[10.15,0]},
  {kind:"fortress",polygon:[[8.59,.03],[8.04,1.16],[6.76,1.16],[6.22,.03],[6.76,-1.07],[8.04,-1.07]],height:[.39,.52],goal:[7.43,0]},
  {kind:"central",polygon:[[3.66,2.05],[1.52,4.86],[1.40,4.86],[1.40,3.88],[2.86,1.74],[2.83,-2.81],[3.47,-2.81],[3.66,-2.17]],height:[.48,.78],goal:[3.23,0]},
  {kind:"outpost",polygon:[[3.44,-2.90],[2.83,-2.90],[2.22,-3.64],[2.22,-4.06],[2.71,-4.77],[3.50,-4.80],[3.50,-4.19],[3.29,-3.85],[3.50,-3.51]],height:[.48,.79],goal:[2.40,-4.00]},
  // Red painted boundary of source 54261; exclude the steep outside ramps by height.
  {kind:"assembly",polygon:[[-.774,1.264],[1.291,-.810],[1.910,.173],[1.910,.556],[.830,1.464]],height:[.60,.86],goal:[1.05,1.05]},
  {kind:"supply",polygon:[[13.99,-4.31],[11.03,-4.31],[10.45,-4.67],[10.45,-7.45],[13.99,-7.45],[13.99,-5.13]],height:[.10,.65],goal:[11.5,-5.65]},
];
export const ARENA_ZONES = (["red","blue"] as const).flatMap(team=>RED_SHAPES.map(shape=>{
  const sign=team==="red"?1:-1;
  const transform=([x,z]:Point):Point=>[x*sign,z*sign];
  return {...shape,team,id:`${team}-${shape.kind}` as ZoneId,polygon:shape.polygon.map(transform),goal:transform(shape.goal)};
}));
function contains(p: ArenaPosition,polygon:readonly Point[]) {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [ax,az]=polygon[i],[bx,bz]=polygon[j];
    if((az>p.z)!==(bz>p.z)&&p.x<(bx-ax)*(p.z-az)/(bz-az)+ax)inside=!inside;
  }
  return inside;
}
export function zonesAtPosition(p:ArenaPosition) {
  return ARENA_ZONES.filter(zone=>p.y>=zone.height[0]&&p.y<=zone.height[1]&&contains(p,zone.polygon)).map(z=>z.id);
}
