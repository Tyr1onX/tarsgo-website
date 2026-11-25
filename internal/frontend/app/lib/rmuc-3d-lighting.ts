import * as THREE from "three";

// One local RGBA lens atlas: translucent team rim, white-hot core and soft
// spill on the adjacent plate. No illumination is cast into the arena.
export function armorLensTexture(team:"red"|"blue"){
  const w=128,h=64,data=new Uint8Array(w*h*4),color=team==="red"?[255,42,65]:[50,117,255];
  const taper=(v:number,a:number,b:number)=>1-THREE.MathUtils.smoothstep(v,a,b);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const u=Math.abs((x+.5)/w*2-1),v=(y+.5)/h*2-1;
    const halo=taper(u,.76,1)*Math.exp(-((v/.52)**2))*.33;
    const lens=taper(u,.77,.85)*taper(Math.abs(v),.27,.35);
    const core=taper(u,.67,.77)*Math.exp(-((v/.10)**2));
    const reflection=taper(u,.70,.80)*Math.exp(-(((v-.20)/.055)**2))*.45;
    const highlight=Math.max(core,reflection),i=(y*w+x)*4;
    for(let c=0;c<3;c++)data[i+c]=Math.round(color[c]+(255-color[c])*highlight);
    data[i+3]=Math.round(255*Math.max(halo,lens*(.58+.42*highlight)));
  }
  const texture=new THREE.DataTexture(data,w,h);
  texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.needsUpdate=true;
  return texture;
}

// The halo is a separate render-only plane placed just outside each real LED
// strip. It neither changes robot bounds nor enters projectile ray roots.
export function createArmorGlow(scene:THREE.Scene,robots:THREE.Object3D[]){
  const group=new THREE.Group();group.name="armor-glow";scene.add(group);
  const geometry=new THREE.PlaneGeometry(1,1);
  const materials={
    red:new THREE.MeshBasicMaterial({map:armorLensTexture("red"),transparent:true,depthWrite:false,toneMapped:false}),
    blue:new THREE.MeshBasicMaterial({map:armorLensTexture("blue"),transparent:true,depthWrite:false,toneMapped:false})
  };
  const slots:{robot:THREE.Object3D;source:THREE.Mesh;plane:THREE.Mesh;offset:THREE.Matrix4}[]=[];
  const z=new THREE.Vector3(0,0,1);
  for(const robot of robots){
    const team=robot.userData.team as "red"|"blue",center=robot.getWorldPosition(new THREE.Vector3());
    robot.traverse(source=>{
      if(!(source instanceof THREE.Mesh)||!source.userData.armorLed)return;
      source.geometry.computeBoundingBox();
      // The detector mesh batches four separate strips. Preserve their original
      // bounds from the existing batching step rather than drawing over its union.
      for(const box of (source.userData.armorLedBounds??[source.geometry.boundingBox!]) as THREE.Box3[]){
        const size=box.getSize(new THREE.Vector3()),point=box.getCenter(new THREE.Vector3());
        const thinX=size.x<size.z,normal=new THREE.Vector3(thinX?1:0,0,thinX?0:1);
        if(normal.clone().transformDirection(source.matrixWorld).dot(source.localToWorld(point.clone()).sub(center))<0)normal.negate();
        point.addScaledVector(normal,(thinX?size.x:size.z)/2+.003);
        const offset=new THREE.Matrix4().compose(point,new THREE.Quaternion().setFromUnitVectors(z,normal),new THREE.Vector3((thinX?size.z:size.x)*1.28,Math.max(.065,size.y*3.3),1));
        const plane=new THREE.Mesh(geometry,materials[team]);plane.matrixAutoUpdate=false;group.add(plane);
        slots.push({robot,source,plane,offset});
      }
    });
  }
  function update(){
    for(const {robot,source,plane,offset} of slots){
      plane.visible=robot.visible&&source.material instanceof THREE.MeshStandardMaterial&&source.material.emissiveIntensity>0;
      if(plane.visible){plane.matrix.multiplyMatrices(source.matrixWorld,offset);plane.matrixWorldNeedsUpdate=true;}
    }
  }
  function dispose(){group.removeFromParent();geometry.dispose();for(const material of Object.values(materials)){material.map!.dispose();material.dispose();}}
  return {group,update,dispose};
}
