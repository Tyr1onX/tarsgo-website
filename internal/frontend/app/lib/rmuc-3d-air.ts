import {systemIdentity} from "./rmuc-3d-identity.ts";
import * as THREE from "three";
import type {Team} from "./rmuc-3d-mechanisms";
export const AIR_PAD_PRODUCT=1754789;
export const AIR_COUNT=4;
const TEAMS=["red","blue"] as const;
export type AirPhase="docked"|"rising"|"hovering"|"returning"|"falling"|"stopped";
export type AirVehicle={id:string;team:Team;phase:AirPhase;home:THREE.Vector3;position:THREE.Vector3;hoverSince:number;object:THREE.Group};
type AirSide={hangar:THREE.Group;vehicles:AirVehicle[];powered:boolean;remote:boolean;nextLaunch:number};
export function airPadCenters(field:THREE.Object3D){
  const out={} as Record<Team,THREE.Vector3>;
  for(const i of [4,5]){
    const node=field.getObjectByName("centre-platform_0_source_"+AIR_PAD_PRODUCT+"_"+i);
    if(!node)throw Error("2027 hangar platform missing");
    const bounds=new THREE.Box3().setFromObject(node,true),center=bounds.getCenter(new THREE.Vector3());
    center.y=bounds.max.y;
    out[center.x>0?"red":"blue"]=center;
  }
  if(!out.red||!out.blue)throw Error("2027 hangar placement invalid");
  return out;
}
export function createAirSystem(scene:THREE.Object3D,pads:Record<Team,THREE.Vector3>){
  const group=new THREE.Group();group.name="rmuc-2027-air-system";scene.add(group);
  const sides={} as Record<Team,AirSide>;
  const frame=new THREE.MeshStandardMaterial({color:0x242a32,metalness:.4,roughness:.55});
  const guard=new THREE.MeshStandardMaterial({color:0x98a6b6,metalness:.3,roughness:.5});
  const bodyGeo=new THREE.BoxGeometry(.055,.032,.055),guardGeo=new THREE.TorusGeometry(.024,.003,5,14),bladeGeo=new THREE.BoxGeometry(.036,.002,.007);
  const shelfGeo=new THREE.BoxGeometry(.3,.02,.3),lampGeo=new THREE.CylinderGeometry(.009,.009,.003,12);
  for(const team of TEAMS){
    const tint=team==="red"?0xff0000:0x0000ff;
    const light=new THREE.MeshStandardMaterial({color:tint,emissive:tint,emissiveIntensity:2.5});
    const hangar=new THREE.Group();hangar.name=team+"-hangar";hangar.position.copy(pads[team]);group.add(hangar);
    const shelf=new THREE.Mesh(shelfGeo,guard);shelf.position.y=.01;hangar.add(shelf);
    const vehicles:AirVehicle[]=[];
    for(let i=0;i<AIR_COUNT;i++){
      const home=pads[team].clone().add(new THREE.Vector3((i%2-.5)*.14,.057,(Math.floor(i/2)-.5)*.14));
      const object=new THREE.Group();object.name=systemIdentity(team,"air").id+"-"+(i+1);
      const body=new THREE.Mesh(bodyGeo,frame);object.add(body);
      for(const x of [-.039,.039])for(const z of [-.039,.039]){
        const ring=new THREE.Mesh(guardGeo,guard);ring.position.set(x,0,z);ring.rotation.x=Math.PI/2;object.add(ring);
        const blade=new THREE.Mesh(bladeGeo,frame);blade.position.set(x,.002,z);object.add(blade);
      }
      const lamp=new THREE.Mesh(lampGeo,light);lamp.position.y=.019;object.add(lamp);
      object.position.copy(home);group.add(object);
      vehicles.push({id:object.name,team,phase:"docked",home,position:object.position,hoverSince:0,object});
    }
    sides[team]={hangar,vehicles,powered:true,remote:true,nextLaunch:5};
  }
  function stop(team:Team){
    const side=sides[team];side.powered=false;side.remote=false;
    // No restarted flight following emergency stop/disqualification.
    for(const v of side.vehicles)if(v.phase!=="docked"&&v.phase!=="stopped")v.phase="falling";
  }
  function finish(){
    for(const t of TEAMS){const s=sides[t];s.powered=false;s.remote=false;for(const v of s.vehicles)if(v.phase!=="docked")v.phase="stopped";}
  }
  function reset(){
    for(const t of TEAMS){const s=sides[t];s.powered=s.remote=true;s.nextLaunch=5;for(const v of s.vehicles){v.phase="docked";v.position.copy(v.home);v.hoverSince=0;}}
  }
  // Virtual training sortie: only vertical rise, ten-second hover, return to
  // the same storage slot. No impact detector, weapon, or target selection.
  // CAD clearance is checked before and during motion; never teleport.
  function advance(elapsed:number,dt:number,clear:(v:AirVehicle,to:THREE.Vector3)=>boolean){
    for(const t of TEAMS){
      const s=sides[t];
      if(s.powered&&s.remote&&elapsed>=s.nextLaunch&&!s.vehicles.some(v=>v.phase!=="docked"&&v.phase!=="stopped")){
        const v=s.vehicles.find(v=>v.phase==="docked"&&v.hoverSince===0);
        if(v&&clear(v,v.home.clone().add(new THREE.Vector3(0,.45,0)))){v.phase="rising";s.nextLaunch=elapsed+1;}
      }
      for(const v of s.vehicles){
        if(v.phase==="docked"||v.phase==="stopped")continue;
        if(v.phase==="falling"){
          const next=v.position.clone();next.y=Math.max(v.home.y,next.y-dt*.5);
          if(!clear(v,next)||next.y===v.home.y){if(clear(v,next))v.position.copy(next);v.phase="stopped";}
          else v.position.copy(next);
          continue;
        }
        if(v.phase==="hovering"){if(elapsed-v.hoverSince>=10)v.phase="returning";else continue;}
        const target=v.home.y+(v.phase==="rising"?.45:0),delta=target-v.position.y;
        const next=v.position.clone();next.y+=Math.sign(delta)*Math.min(Math.abs(delta),.25*dt);
        if(!clear(v,next)){stop(t);break;}
        v.position.copy(next);
        if(Math.abs(target-next.y)<1e-8){if(v.phase==="rising"){v.phase="hovering";v.hoverSince=elapsed;}else v.phase="docked";}
      }
    }
  }
  function view(perspective:Team|"all"){
    // S76 allows hangar communication while docked; flying craft have no
    // direct data link to the ground controller. Observer gets visual state.
    return TEAMS.filter(t=>perspective==="all"||t===perspective).map(t=>{
      const s=sides[t];return {team:t,powered:s.powered,docked:s.vehicles.filter(v=>v.phase==="docked").length,
        total:AIR_COUNT,airborne:perspective==="all"?s.vehicles.filter(v=>!["docked","stopped"].includes(v.phase)).map(v=>({id:v.id,x:v.position.x,z:v.position.z,phase:v.phase})):[],
        x:pads[t].x,z:pads[t].z};
    });
  }
  return {group,sides,stop,finish,reset,advance,view};
}
