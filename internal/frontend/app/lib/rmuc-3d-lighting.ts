import * as THREE from "three";
import {softGlowTexture} from "./rmuc-3d-projectiles.ts";

// The halo is a separate render-only plane placed just outside each real LED
// strip. It neither changes robot bounds nor enters projectile ray roots.
export function createArmorGlow(scene:THREE.Scene,robots:THREE.Object3D[]){
  const group=new THREE.Group();group.name="armor-glow";scene.add(group);
  const geometry=new THREE.PlaneGeometry(1,1),texture=softGlowTexture();
  const materials={
    red:new THREE.MeshBasicMaterial({map:texture,color:0xff263d,transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),
    blue:new THREE.MeshBasicMaterial({map:texture,color:0x397dff,transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false})
  };
  const slots:{robot:THREE.Object3D;source:THREE.Mesh;plane:THREE.Mesh;offset:THREE.Matrix4}[]=[];
  const z=new THREE.Vector3(0,0,1);
  for(const robot of robots){
    const team=robot.userData.team as "red"|"blue",center=robot.getWorldPosition(new THREE.Vector3());
    robot.traverse(source=>{
      if(!(source instanceof THREE.Mesh)||!source.userData.armorLed)return;
      source.geometry.computeBoundingBox();const box=source.geometry.boundingBox!,size=box.getSize(new THREE.Vector3()),point=box.getCenter(new THREE.Vector3());
      const thinX=size.x<size.z,normal=new THREE.Vector3(thinX?1:0,0,thinX?0:1);
      if(normal.clone().transformDirection(source.matrixWorld).dot(source.localToWorld(point.clone()).sub(center))<0)normal.negate();
      point.addScaledVector(normal,(thinX?size.x:size.z)/2+.003);
      const offset=new THREE.Matrix4().compose(point,new THREE.Quaternion().setFromUnitVectors(z,normal),new THREE.Vector3((thinX?size.z:size.x)*1.22,Math.max(.055,size.y*2.8),1));
      const plane=new THREE.Mesh(geometry,materials[team]);plane.matrixAutoUpdate=false;group.add(plane);
      slots.push({robot,source,plane,offset});
    });
  }
  function update(){
    for(const {robot,source,plane,offset} of slots){
      plane.visible=robot.visible&&source.material instanceof THREE.MeshStandardMaterial&&source.material.emissiveIntensity>0;
      if(plane.visible){plane.matrix.multiplyMatrices(source.matrixWorld,offset);plane.matrixWorldNeedsUpdate=true;}
    }
  }
  function dispose(){group.removeFromParent();geometry.dispose();texture.dispose();materials.red.dispose();materials.blue.dispose();}
  return {group,update,dispose};
}
