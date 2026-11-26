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


// Shared, render-only shell. The exact referee branch determines whether a
// contact can produce a ripple; the mesh never participates in ray roots.
export function createIonShieldMaterial(){
  return new THREE.ShaderMaterial({
    transparent:true,depthTest:true,depthWrite:false,side:THREE.FrontSide,
    uniforms:{strength:{value:0},time:{value:0},rippleAge:{value:2},rippleDirection:{value:new THREE.Vector3(0,1,0)},clipCount:{value:0},clipPlanes:{value:Array.from({length:5},()=>new THREE.Vector4())}},
    vertexShader:`
      varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal; varying vec3 vWorld;
      void main(){
        vLocal=normalize(position);vWorld=(modelMatrix*vec4(position,1.)).xyz;
        vec4 p=modelViewMatrix*vec4(position,1.);
        vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader:`
      uniform float strength,time,rippleAge;
      uniform vec3 rippleDirection;
      uniform int clipCount;uniform vec4 clipPlanes[5];
      varying vec3 vNormal,vView,vLocal,vWorld;
      float hexEdge(vec2 p){
        vec2 r=vec2(1.,1.7320508);
        vec2 a=mod(p,r)-r*.5;
        vec2 b=mod(p-r*.5,r)-r*.5;
        vec2 h=dot(a,a)<dot(b,b)?a:b;
        return max(abs(h.x),dot(abs(h),normalize(r)));
      }
      void main(){
        for(int i=0;i<5;i++){if(i<clipCount&&dot(clipPlanes[i],vec4(vWorld,1.))<0.)discard;}
        vec3 n=normalize(vLocal);
        float edge=pow(1.-max(0.,dot(normalize(vNormal),normalize(vView))),2.6);
        vec2 uv=vec2(atan(n.z,n.x)*3.82,asin(n.y)*3.82);
        float grid=smoothstep(.43,.49,hexEdge(uv));
        float wave=.5+.5*sin(n.y*11.-time*2.);
        float dist=acos(clamp(dot(n,rippleDirection),-1.,1.));
        float ripple=(1.-smoothstep(.0,.65,rippleAge))*exp(-pow((dist-rippleAge*4.)/.12,2.));
        float alpha=strength*(.012+edge*.52+grid*(.068+.10*edge)+wave*.008+ripple*.52);
        vec3 color=mix(vec3(.008,.18,.68),vec3(.12,.68,1.),clamp(edge*.85+ripple*.5,0.,1.));
        gl_FragColor=vec4(color,clamp(alpha,0.,.7));
        #include <colorspace_fragment>
      }`
  });
}

// Official CAD has solid PBR colors and no UVs. Refine only identified
// neutral architectural surfaces. Painted rule markings keep source colors.
export function applyArenaSurfaceDetail(root:THREE.Object3D,anisotropy:number){
  const surfaces=new Map<THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>,"floor"|"concrete">();
  root.traverse(o=>{
    if(!(o instanceof THREE.Mesh)||!(o.material instanceof THREE.MeshStandardMaterial))return;
    let node:THREE.Object3D|null=o;
    while(node&&node!==root&&!/^(floor_|red-road_|blue-road_|centre-platform_|red-ramp-dart-station_|blue-ramp-dart-station_|red-resource-zone_|blue-resource-zone_|base-footing_)/.test(node.name))node=node.parent;
    if(!node||node===root)return;
    const name=o.material.name;
    if(name==="colour_default"||name==="colour_0.2549,0.2549,0.2549"||name==="colour_0.2000,0.2000,0.2000"&&node.name.startsWith("floor_"))surfaces.set(o,"floor");
    else if(name==="colour_0.7843,0.7843,0.7059")surfaces.set(o,"concrete");
  });
  if(!surfaces.size)return;
  const tiles=new Map<"floor"|"concrete",THREE.DataTexture>();
  const materials=new Map<THREE.MeshStandardMaterial,Map<string,THREE.MeshStandardMaterial>>();
  const originals=new Set<THREE.Material>();
  const point=new THREE.Vector3(),normal=new THREE.Vector3();
  for(const [mesh,kind] of surfaces){
    let tile=tiles.get(kind);
    if(!tile){
      const size=512,data=new Uint8Array(size*size*4);
      // Periodic low-frequency variation survives mipmapping; fine grains
      // distinguish the near-field finish without a seam at tile borders.
      const grid=kind==="floor"?16:8;
      const noise=(x:number,y:number)=>(((Math.imul((x%grid)+1,73856093)^Math.imul((y%grid)+1,19349663))>>>0)%1021)/1020;
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const h=(Math.imul(x+1,73856093)^Math.imul(y+1,19349663))>>>0;
        const u=x*grid/size,vv=y*grid/size,i0=Math.floor(u),j0=Math.floor(vv),a=u-i0,b=vv-j0;
        const coarse=THREE.MathUtils.lerp(THREE.MathUtils.lerp(noise(i0,j0),noise(i0+1,j0),a),THREE.MathUtils.lerp(noise(i0,j0+1),noise(i0+1,j0+1),a),b)-.5;
        const v=kind==="floor"?226+(h%31)-15+coarse*52:237+(h%15)-7+coarse*26;
        const i=(y*size+x)*4;
        data[i]=data[i+1]=data[i+2]=Math.min(255,v);data[i+3]=255;
      }
      tile=new THREE.DataTexture(data,size,size);
      tile.wrapS=tile.wrapT=THREE.RepeatWrapping;tile.magFilter=THREE.LinearFilter;
      tile.minFilter=THREE.LinearMipmapLinearFilter;tile.generateMipmaps=true;
      tile.anisotropy=Math.min(4,anisotropy);tile.needsUpdate=true;tiles.set(kind,tile);
    }
    const geometry=mesh.geometry,position=geometry.getAttribute("position"),normals=geometry.getAttribute("normal");
    // Dominant-axis projection avoids stretching vertical CAD walls. Local
    // coordinates also keep UVs valid when mirrored instances share geometry.
    if(!geometry.hasAttribute("uv")){
      const uv=new Float32Array(position.count*2);
      for(let i=0;i<position.count;i++){
        point.fromBufferAttribute(position,i);normal.fromBufferAttribute(normals,i);
        const x=Math.abs(normal.x),y=Math.abs(normal.y),z=Math.abs(normal.z);
        uv[i*2]=(x>y&&x>z?point.z:point.x)*2;
        uv[i*2+1]=(z>=x&&z>=y||x>y&&x>z?point.y:point.z)*2;
      }
      geometry.setAttribute("uv",new THREE.BufferAttribute(uv,2));
    }
    const source=mesh.material;
    let variants=materials.get(source);
    if(!variants){variants=new Map();materials.set(source,variants);}
    let material=variants.get(kind);
    if(!material){
      material=source.clone();material.map=tile;material.roughnessMap=tile;
      material.roughness=kind==="floor"?.94:.88;
      variants.set(kind,material);originals.add(source);
    }
    mesh.material=material;
  }
  // Dispose replaced source materials only if no other CAD mesh uses them.
  root.traverse(o=>{if(o instanceof THREE.Mesh){for(const m of Array.isArray(o.material)?o.material:[o.material])originals.delete(m);}});
  for(const m of originals)m.dispose();
}
