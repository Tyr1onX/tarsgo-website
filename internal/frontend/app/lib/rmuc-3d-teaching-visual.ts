import * as THREE from "three";
import {territoryStatus,type Match} from "./rmuc-3d-match";
import {ARENA_ZONES} from "./rmuc-3d-zones";
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
        return [x,zone.height[1]+.035,z];
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
    const canvas=document.createElement("canvas");canvas.width=512;canvas.height=96;
    const ctx=canvas.getContext("2d")!;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,toneMapped:false});
    const sprite=new THREE.Sprite(material);sprite.renderOrder=20;group.add(sprite);
    let previous="";
    return {sprite,draw(text:string,color:string){
      const key=text+color;if(key===previous)return;previous=key;
      ctx.clearRect(0,0,512,96);ctx.beginPath();ctx.fillStyle="#101715ed";ctx.roundRect(5,5,502,86,14);ctx.fill();
      ctx.strokeStyle=color;ctx.lineWidth=5;ctx.strokeRect(8,8,496,80);
      ctx.fillStyle="#ffffff";ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="bold 36px sans-serif";ctx.fillText(text,256,48,470);
      texture.needsUpdate=true;
    },dispose(){material.dispose();texture.dispose();}};
  }
  const robotLabels=[{robot:red,team:"红方",color:"#ff7777",tag:label()},{robot:blue,team:"蓝方",color:"#70baff",tag:label()}];
  const zoneLabels=boundaries.map(({zone})=>({zone,tag:label()}));
  const stateTag=label();
  function scale(sprite:THREE.Sprite,camera:THREE.PerspectiveCamera,height:number,pixels=24){
    const distance=camera.position.distanceTo(sprite.position);
    const h=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*pixels/Math.max(1,height);
    sprite.scale.set(h*512/96,h,1);
  }
  return {update(match:Match,camera:THREE.PerspectiveCamera,height:number,driving?:THREE.Object3D){
    const area=territoryStatus(match,"blue","outpost"),color=area.contested?"#ffcc55":area.controller==="red"?"#ff7777":"#70baff";
    for(const {mesh} of boundaries)mesh.material.color.set(color);
    for(const {robot,team,color,tag} of robotLabels){
      const state=match.robots.find(r=>r.id===robot.name);
      tag.sprite.visible=robot!==driving&&!!state&&state.hp>0;
      if(!tag.sprite.visible||!state)continue;
      tag.sprite.position.copy(robot.position);tag.sprite.position.y+=1.05;
      tag.draw(team+"步兵 · "+Math.round(state.hp)+" HP",color);
      scale(tag.sprite,camera,height,28);
    }
    for(const {zone,tag} of zoneLabels){
      const [x,z]=zone.goal;
      tag.sprite.position.set(x,terrain.heightAt(x,z)+.25,z);
      tag.draw(zone.kind==="central"?"中央高地":"前哨增益点",color);
      scale(tag.sprite,camera,height,23);
    }
    stateTag.sprite.visible=!driving;
    const [x,z]=zoneLabels.find(l=>l.zone.kind==="central")!.zone.goal;
    stateTag.sprite.position.set(x-.55,terrain.heightAt(x,z)+1.4,z+2.6);
    stateTag.draw(area.contested?"争夺暂停 · "+(area.progress/10).toFixed(1)+"s":area.progressing?(area.full?"占领中 · ":"恢复中 · ")+(area.progress/10).toFixed(1)+"s":(area.controller==="red"?"红方":"蓝方")+(area.full?"完全控制":"临时控制"),color);
    scale(stateTag.sprite,camera,height,30);
  },dispose(){
    group.removeFromParent();
    for(const {mesh} of boundaries){mesh.geometry.dispose();mesh.material.dispose();}
    for(const {tag} of [...robotLabels,...zoneLabels])tag.dispose();
    stateTag.dispose();
  }};
}
