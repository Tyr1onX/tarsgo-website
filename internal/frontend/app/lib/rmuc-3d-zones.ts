import type { Team } from "./rmuc-3d-mechanisms.ts";

export type ZoneKind = "base" | "fortress" | "outpost" | "central" | "supply" | "assembly" | "highpoint";
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
  {kind:"highpoint",polygon:[[11.557,4.298],[12.231,3.625],[12.969,3.625],[13.643,4.298],[13.643,5.037],[12.969,5.710],[12.231,5.710],[11.557,5.037]],height:[.93,1.03],goal:[12.6,4.65]},
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

// Fig. 5-23 projected onto the actual GLB white card markings. RFID
// footprints are estimated; height separates the tunnel interior/roof.
export type CrossingKind="road"|"highland"|"tunnel";
type Card={course:string;kind:CrossingKind;part:"low"|"high"|"a"|"b"|"inside";rect:readonly [number,number,number,number];height:readonly [number,number]};
const RED_CARDS:readonly Card[]=[
  {course:"road",kind:"road",part:"low",rect:[5.226,6.299,-5.32,-4.715],height:[.14,.20]},
  {course:"road",kind:"road",part:"high",rect:[5.226,6.299,-6.173,-5.568],height:[.32,.38]},
  {course:"highland",kind:"highland",part:"low",rect:[4.794,5.684,-1.456,1.416],height:[.24,.32]},
  {course:"tunnel-a",kind:"tunnel",part:"a",rect:[4.275,5.125,-6.25,-5.55],height:[.28,.40]},
  {course:"tunnel-a",kind:"tunnel",part:"inside",rect:[4.275,5.125,-5.55,-5.075],height:[.12,.40]},
  {course:"tunnel-a",kind:"tunnel",part:"b",rect:[4.275,5.125,-5.075,-4.20],height:[.16,.29]},
  {course:"tunnel-b",kind:"tunnel",part:"a",rect:[-1.975,-1.125,-6.325,-5.575],height:[.10,.20]},
  {course:"tunnel-b",kind:"tunnel",part:"inside",rect:[-1.125,-.775,-6.325,-5.575],height:[.10,.20]},
  {course:"tunnel-b",kind:"tunnel",part:"b",rect:[-.775,.10,-6.325,-5.575],height:[.10,.20]},
  {course:"tunnel-c",kind:"tunnel",part:"a",rect:[-1.025,-.125,-7.325,-6.55],height:[.28,.36]},
  {course:"tunnel-c",kind:"tunnel",part:"inside",rect:[-.125,.20,-7.325,-6.55],height:[.28,.36]},
  {course:"tunnel-c",kind:"tunnel",part:"b",rect:[.20,1.075,-7.325,-6.55],height:[.28,.36]},
];
export type CrossingContact=Pick<Card,"kind"|"part"|"course">;
export function crossingContacts(p:ArenaPosition,zones:readonly ZoneId[]):CrossingContact[]{
  const result:CrossingContact[]=[];
  for(const team of ["red","blue"] as const){
    const sign=team==="red"?1:-1,x=p.x*sign,z=p.z*sign;
    for(const card of RED_CARDS){
      const [xmin,xmax,zmin,zmax]=card.rect;
      if(x>=xmin&&x<xmax&&z>=zmin&&z<zmax&&p.y>=card.height[0]&&p.y<=card.height[1])
        result.push({course:team+"-"+card.course,kind:card.kind,part:card.part});
    }
    if(zones.includes(`${team}-central`))result.push({course:team+"-highland",kind:"highland",part:"high"});
  }
  return result;
}
