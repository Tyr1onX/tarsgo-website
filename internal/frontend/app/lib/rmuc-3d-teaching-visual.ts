import * as THREE from "three";
import {territoryStatus,type Match} from "./rmuc-3d-match";
import {ARENA_ZONES,zonesAtPosition} from "./rmuc-3d-zones";
import type {ArenaTerrain} from "./rmuc-3d-terrain";

// Teaching overlays are render-only, never added to terrain, hit or navigation roots.
export function createTerritoryTeachingVisuals(scene:THREE.Scene,terrain:ArenaTerrain,red:THREE.Object3D,blue:THREE.Object3D){
  const group=new THREE.Group();scene.add(group);
  const boundaries=ARENA_ZONES.filter(z=>z.id==="blue-central"||z.id==="blue-outpost").map(zone=>{
    const vertices:number[]=[];
    const polygon=zone.polygon;
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),n=Math.max(1,Math.ceil(length/.15));
      const nx=-dz/length*.045,nz=dx/length*.045;
      const point=(t:number,side:number)=>{
        const x=a[0]+dx*t+nx*side,z=a[1]+dz*t+nz*side;
        return [x,THREE.MathUtils.clamp(terrain.heightAt(x,z),zone.height[0],zone.height[1])+.035,z];
      };
      for(let j=0;j<n;j++){
        const a0=point(j/n,-1),a1=point(j/n,1),b0=point((j+1)/n,-1),b1=point((j+1)/n,1);
        vertices.push(...a0,...a1,...b0,...a1,...b1,...b0);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
    const material=new THREE.MeshBasicMaterial({color:0x54b4ff,side:THREE.DoubleSide,depthWrite:false,transparent:true,opacity:.88,toneMapped:false});
    const mesh=new THREE.Mesh(geometry,material);group.add(mesh);
    return {zone,mesh};
  });
  function label(){
    const canvas=document.createElement("canvas");canvas.width=288;canvas.height=96;
    const ctx=canvas.getContext("2d")!;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,toneMapped:false});
    const sprite=new THREE.Sprite(material);sprite.renderOrder=20;group.add(sprite);
    let previous="";
    return {sprite,draw(text:string,color:string){
      const key=text+color;if(key===previous)return;previous=key;
      ctx.clearRect(0,0,288,96);ctx.beginPath();ctx.fillStyle="#101715ed";ctx.roundRect(5,5,278,86,14);ctx.fill();
      ctx.strokeStyle=color;ctx.lineWidth=5;ctx.strokeRect(8,8,272,80);
      ctx.fillStyle="#ffffff";ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="bold 36px sans-serif";ctx.fillText(text,144,48,260);
      texture.needsUpdate=true;
    },dispose(){material.dispose();texture.dispose();}};
  }
  const robotLabels=[{robot:red,color:"#ff7777",tag:label()},{robot:blue,color:"#70baff",tag:label()}];
  const stateTag=label(),outpostTag=label();
  const direction=new THREE.Mesh(new THREE.ConeGeometry(.14,.28,3),new THREE.MeshBasicMaterial({color:0xf4cb65,depthTest:false,depthWrite:false,toneMapped:false}));
  direction.renderOrder=23;group.add(direction);direction.visible=false;
  const track=new THREE.Mesh(new THREE.RingGeometry(.36,.44,64),new THREE.MeshBasicMaterial({color:0x142724,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));
  const progress=new THREE.Mesh(new THREE.RingGeometry(.36,.44,64,1,Math.PI/2,Math.PI*2),new THREE.MeshBasicMaterial({color:0xf4cb65,side:THREE.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false}));
  const target=new THREE.Mesh(new THREE.RingGeometry(.22,.32,32),new THREE.MeshBasicMaterial({color:0xf4cb65,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));
  target.rotation.x=-Math.PI/2;target.visible=false;group.add(track,progress,target);
  track.renderOrder=21;progress.renderOrder=22;
  function scale(sprite:THREE.Sprite,camera:THREE.PerspectiveCamera,height:number,pixels=24){
    const distance=camera.position.distanceTo(sprite.position);
    const h=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*pixels/Math.max(1,height);
    sprite.scale.set(h*3.0,h,1);
  }
  const offset=new THREE.Vector3(),forward=new THREE.Vector3(),goalDirection=new THREE.Vector3();
  return {visible(value:boolean){group.visible=value;},update(match:Match,camera:THREE.PerspectiveCamera,height:number,driving:THREE.Object3D|undefined,practice:{target:THREE.Vector3;practice:boolean;done:boolean;failed:boolean}){
    const area=territoryStatus(match,"blue","outpost"),color=area.contested?"#ffcc55":area.controller==="red"?"#ff7777":"#70baff";
    for(const {mesh,zone} of boundaries){
      const redInside=zonesAtPosition(red.position).includes(zone.id),blueInside=zonesAtPosition(blue.position).includes(zone.id);
      const tint=area.contested?(redInside&&blueInside?"#ffcc55":redInside?"#ff7777":blueInside?"#70baff":"#ffcc55"):color;
      mesh.material.color.set(tint);mesh.material.opacity=area.full?.88:.62;
    }
    for(const {robot,color,tag} of robotLabels){
      const state=match.robots.find(r=>r.id===robot.name);
      tag.sprite.visible=robot!==driving&&!!state&&state.hp>0;
      if(!tag.sprite.visible||!state)continue;
      tag.sprite.position.copy(robot.position);tag.sprite.position.y+=1.05;
      tag.draw("♥ "+Math.round(state.hp),color);
      scale(tag.sprite,camera,height,28);
    }
    // One indicator follows the local region during observation, and the
    // player's control view during practice. All values are referee state.
    const [x,z]=ARENA_ZONES.find(l=>l.id==="blue-central")!.goal;
    const local=!!driving&&practice.practice;
    const foreground=local||area.contested||area.progress>0;
    if(local){
      const dist=1.6, h=dist*Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      track.position.copy(camera.position).add(offset.set(0,.30*h,-dist).applyQuaternion(camera.quaternion));
      track.scale.setScalar(.24);
      stateTag.sprite.position.copy(track.position);
      direction.position.copy(camera.position).add(offset.set(0,.60*h,-dist).applyQuaternion(camera.quaternion));
      camera.getWorldDirection(forward);forward.y=0;forward.normalize();
      goalDirection.copy(practice.target).sub(driving.position);goalDirection.y=0;
      const angle=Math.atan2(forward.x*goalDirection.z-forward.z*goalDirection.x,forward.dot(goalDirection));
      direction.quaternion.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),angle));
      direction.scale.setScalar(.48);direction.visible=!practice.done&&goalDirection.lengthSq()>.09&&!area.progressing;
    }else{
      stateTag.sprite.position.set(x-.55,terrain.heightAt(x,z)+1.12,z+2.6);
      track.position.copy(stateTag.sprite.position);track.position.y+=.42;
      track.scale.setScalar(.8);direction.visible=false;
    }
    stateTag.sprite.visible=true;
    stateTag.draw(practice.failed?"×":practice.done?"✓":area.contested?"Ⅱ":area.progressing?(area.progress/10).toFixed(1):area.full?"◆":"◇",practice.failed?"#ff7777":practice.done?"#8ce6a4":color);
    scale(stateTag.sprite,camera,height,local?27:26);
    track.quaternion.copy(camera.quaternion);
    progress.position.copy(track.position);progress.quaternion.copy(track.quaternion);progress.scale.copy(track.scale);
    track.visible=foreground&&!practice.done;progress.visible=track.visible;
    progress.material.color.set(color);progress.geometry.setDrawRange(0,Math.floor(area.progress/50*64)*6);
    const side=match.sides.blue;
    const [ox,oz]=ARENA_ZONES.find(l=>l.id==="blue-outpost")!.goal;
    outpostTag.sprite.position.set(ox,terrain.heightAt(ox,oz)+2.1,oz);
    outpostTag.draw("⚑ "+side.outpost,side.outpostOwner==="blue"?"#70baff":"#ff7777");
    outpostTag.sprite.visible=!driving;scale(outpostTag.sprite,camera,height,23);
    target.visible=practice.practice&&!practice.done;
    target.position.copy(practice.target);target.position.y+=.12;
  },dispose(){
    group.removeFromParent();
    for(const {mesh} of boundaries){mesh.geometry.dispose();mesh.material.dispose();}
    for(const {tag} of robotLabels)tag.dispose();
    stateTag.dispose();outpostTag.dispose();
    for(const m of [track,progress,target,direction]){m.geometry.dispose();m.material.dispose();}
  }};
}
