import * as THREE from "three";
import type {ArenaSettings} from "./rmuc-3d-settings";

export type WorldAction="territory"|"match"|"pause"|"resume"|"replay"|"explore"|"take"|"sound"|"quality"|"red"|"blue";
type Button={action:WorldAction;mesh:THREE.Mesh;texture:THREE.CanvasTexture;material:THREE.MeshBasicMaterial;draw:(symbol:string,color?:string)=>void};
const icons:Record<WorldAction,string>={territory:"◎",match:"▶",pause:"Ⅱ",resume:"▶",replay:"↻",explore:"⌂",take:"✥",sound:"♪",quality:"◈",red:"◆",blue:"◆"};

// The interaction console is a physical world object. The small remote control
// is held in the camera view only when the simulation owns the camera.
export function createWorldControls(scene:THREE.Scene,terrainHeight:(x:number,z:number)=>number){
  const anchor=new THREE.Group(),remote=new THREE.Group();
  scene.add(anchor,remote);
  const geometry=new THREE.BoxGeometry(.36,.36,.10);
  const buttons:Button[]=[];
  function add(parent:THREE.Group,action:WorldAction,x:number,y:number){
    const canvas=document.createElement("canvas");canvas.width=128;canvas.height=128;
    const ctx=canvas.getContext("2d")!;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
    const mesh=new THREE.Mesh(geometry,material);mesh.name="world-"+action;mesh.position.set(x,y,0);parent.add(mesh);
    let previous="";
    function draw(symbol:string,color="#f7f4e9"){
      const key=symbol+color;if(previous===key)return;previous=key;
      ctx.fillStyle="#182624";ctx.fillRect(0,0,128,128);
      ctx.strokeStyle="#d4bc80";ctx.lineWidth=6;ctx.strokeRect(4,4,120,120);
      ctx.fillStyle=color;ctx.font="bold 78px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(symbol,64,65);
      texture.needsUpdate=true;
    }
    draw(icons[action],action==="red"?"#ff7777":action==="blue"?"#70baff":undefined);
    buttons.push({action,mesh,texture,material,draw});
    return mesh;
  }
  // At the accessible blue outpost approach; face the observer's spawn.
  anchor.position.set(-1.65,terrainHeight(-1.65,4)+1.33,4);
  anchor.scale.setScalar(.75);
  anchor.rotation.y=Math.PI/2;
  const backing=new THREE.Mesh(new THREE.BoxGeometry(1.42,.95,.16),new THREE.MeshBasicMaterial({color:0x293a38}));
  backing.position.set(0,-.22,-.11);anchor.add(backing);
  const pole=new THREE.Mesh(new THREE.BoxGeometry(.09,1.7,.09),new THREE.MeshBasicMaterial({color:0x293a38}));
  pole.position.set(0,-1.1,-.12);anchor.add(pole);
  add(anchor,"territory",0,0);add(anchor,"match",-.44,0);
  add(anchor,"sound",.44,0);
  add(anchor,"red",-.44,-.44);add(anchor,"quality",0,-.44);add(anchor,"blue",.44,-.44);
  const remoteButtons=(["pause","resume","replay","explore","take","match"] as const).map(a=>add(remote,a,0,0));
  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),offset=new THREE.Vector3();
  function update(camera:THREE.PerspectiveCamera,state:{guided:boolean;active:boolean;paused:boolean;take:boolean;driving:boolean;done:boolean;view:string;experiment:boolean;completed:boolean;settings:ArenaSettings}){
    anchor.visible=!state.experiment&&!state.active&&!state.guided&&!state.driving&&state.view==="first";
    remote.visible=!state.experiment&&!anchor.visible;
    for(const b of buttons){if(b.action==="territory")b.draw(state.completed?"✓":"◎");if(b.action==="sound")b.draw(state.settings.muted?"×":"♪");if(b.action==="quality")b.draw(({auto:"A",low:"1",medium:"2",high:"3"})[state.settings.quality]);}
    const actions=state.guided?(state.take?["take","replay","explore"]:state.done?["replay","explore"]:[state.paused?"resume":"pause","replay","explore"]):!state.active?(state.take?["take","match","explore"]:["match","explore"]):state.take?["take",state.paused?"resume":"pause","replay","explore"]:[state.paused?"resume":"pause","replay","explore"];
    for(const b of remoteButtons)b.visible=actions.includes(b.name.slice(6));
    const visible=actions.map(a=>remoteButtons.find(b=>b.name==="world-"+a)!);
    remote.quaternion.copy(camera.quaternion);
    const halfHeight=1.5*Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    remote.position.copy(camera.position).add(offset.set(0,-halfHeight*(state.driving && camera.aspect < .8 ? .53 : .79),-1.5).applyQuaternion(camera.quaternion));
    remote.scale.setScalar(Math.min(halfHeight*.42,halfHeight*camera.aspect*.72));
    visible.forEach((mesh,i)=>mesh.position.x=(i-(visible.length-1)/2)*.43);
    for(const mesh of remoteButtons){mesh.renderOrder=100;const material=mesh.material as THREE.MeshBasicMaterial;material.depthTest=false;material.depthWrite=false;}
    anchor.updateMatrixWorld(true);remote.updateMatrixWorld(true);
  }
  function pick(camera:THREE.PerspectiveCamera,x=0,y=0){
    ray.setFromCamera(ndc.set(x,y),camera);
    const candidates=buttons.filter(b=>b.mesh.visible&&b.mesh.parent?.visible);
    const hit=ray.intersectObjects(candidates.map(b=>b.mesh),false)[0];
    if(!hit||hit.object.parent===anchor&&hit.distance>3.5)return null;
    return candidates.find(b=>b.mesh===hit.object)?.action??null;
  }
  return {update,pick,dispose(){anchor.removeFromParent();remote.removeFromParent();geometry.dispose();for(const m of [backing,pole]){m.geometry.dispose();m.material.dispose();}for(const b of buttons){b.material.dispose();b.texture.dispose();}}};
}
