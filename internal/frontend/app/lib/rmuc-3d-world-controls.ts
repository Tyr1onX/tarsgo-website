import * as THREE from "three";
import type {ArenaSettings} from "./rmuc-3d-settings";
import type {ArenaStatus} from "./rmuc-3d-scene";

export type WorldAction="territory"|"match"|"pause"|"resume"|"replay"|"explore"|"take"|"red"|"blue"|"view"|"settings"|"actions"|"interact"|"exit"|"close"|"next"|"previous"|"radar";
export type WorldCommand={id:string;symbol:string;detail?:string;color?:string;run:()=>void};
const icons:Record<WorldAction,string>={territory:"◎",match:"▶",pause:"Ⅱ",resume:"▶",replay:"↻",explore:"⌂",take:"✥",red:"◆",blue:"◆",view:"◉",settings:"⚙",actions:"✣",interact:"↔",exit:"⏻",close:"×",next:"›",previous:"‹",radar:"⌖"};
type Button={mesh:THREE.Mesh;texture:THREE.CanvasTexture;material:THREE.MeshBasicMaterial;command:WorldCommand|null;draw:(c:WorldCommand)=>void};
const RED="#ff7777",BLUE="#70baff",GOLD="#d4bc80";

export function createWorldControls(scene:THREE.Scene,terrainHeight:(x:number,z:number)=>number,onAction:(action:WorldAction)=>void){
  const anchor=new THREE.Group(),remote=new THREE.Group(),instrument=new THREE.Group();
  scene.add(anchor,remote,instrument);
  const buttonGeometry=new THREE.BoxGeometry(.36,.36,.10),housingGeometry=new THREE.BoxGeometry(1,1,.14);
  const housingMaterial=new THREE.MeshBasicMaterial({color:0x293a38});
  const buttons:Button[]=[];
  const fixed=(id:WorldAction,symbol=icons[id],detail?:string):WorldCommand=>({id,symbol,detail,color:id==="red"?RED:id==="blue"?BLUE:undefined,run:()=>onAction(id)});
  function add(parent:THREE.Group,x=0,y=0,command:WorldCommand|null=null){
    const canvas=document.createElement("canvas");canvas.width=128;canvas.height=128;
    const ctx=canvas.getContext("2d")!,texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
    const mesh=new THREE.Mesh(buttonGeometry,material);mesh.position.set(x,y,0);parent.add(mesh);
    let previous="";
    function draw(c:WorldCommand){
      const key=[c.symbol,c.detail,c.color].join("|");if(previous===key)return;previous=key;
      ctx.fillStyle="#182624";ctx.fillRect(0,0,128,128);
      ctx.strokeStyle=GOLD;ctx.lineWidth=6;ctx.strokeRect(4,4,120,120);
      ctx.fillStyle=c.color??"#f7f4e9";ctx.font="bold "+(c.detail?"52":"78")+"px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(c.symbol,64,c.detail?49:65,112);
      if(c.detail){ctx.font="bold 24px sans-serif";ctx.fillText(c.detail,64,97,112);}
      texture.needsUpdate=true;
    }
    const b={mesh,texture,material,command,draw};buttons.push(b);
    if(command){mesh.name="world-"+command.id;draw(command);}else mesh.visible=false;
    return b;
  }
  anchor.position.set(-1.65,terrainHeight(-1.65,4)+1.33,4);
  anchor.scale.setScalar(.75);anchor.rotation.y=Math.PI/2;
  const backing=new THREE.Mesh(housingGeometry,housingMaterial);backing.scale.set(1.42,.95,1.14);backing.position.set(0,-.22,-.11);anchor.add(backing);
  const pole=new THREE.Mesh(housingGeometry,housingMaterial);pole.scale.set(.09,1.7,.64);pole.position.set(0,-1.1,-.12);anchor.add(pole);
  const lesson=add(anchor,0,0,fixed("territory"));
  add(anchor,-.44,0,fixed("match"));add(anchor,.44,0,fixed("settings"));
  add(anchor,-.44,-.44,fixed("red"));add(anchor,0,-.44,fixed("view"));add(anchor,.44,-.44,fixed("blue"));
  const remoteHousing=new THREE.Mesh(housingGeometry,new THREE.MeshBasicMaterial({color:0x293a38,depthTest:false,depthWrite:false}));
  remoteHousing.renderOrder=98;remote.add(remoteHousing);
  const slots=Array.from({length:9},()=>add(remote));
  for(const b of slots){b.mesh.renderOrder=100;b.material.depthTest=false;b.material.depthWrite=false;}
  // One physical instrument: public score and the selected robot's actual telemetry.
  const display=document.createElement("canvas");display.width=768;display.height=224;
  const dc=display.getContext("2d")!,displayTexture=new THREE.CanvasTexture(display);displayTexture.colorSpace=THREE.SRGBColorSpace;
  const displayMaterial=new THREE.MeshBasicMaterial({map:displayTexture,toneMapped:false,depthTest:false,depthWrite:false});
  const displayMesh=new THREE.Mesh(new THREE.BoxGeometry(1,224/768,.035),displayMaterial);displayMesh.renderOrder=99;instrument.add(displayMesh);
  let lastDisplay="",radarImage:HTMLImageElement|undefined,radarSource="";
  function drawDisplay(status:ArenaStatus,radar:boolean){
    const m=status.match;if(!m)return;
    const a=m.sides.red,b=m.sides.blue,focus=status.focus;
    const key=JSON.stringify([radar,status.countdown,m.phase,m.seconds,m.winner,a.base,b.base,a.outpost,b.outpost,a.outpostArea,b.outpostArea,a.outpostOwner,b.outpostOwner,m.hp,m.maxHp,m.ammo,m.reserve,m.heat,m.heatLimit,m.power?.buffer,m.coins,focus?.team,focus?.number,m.revival?.progress,m.thermalLock,m.pendingAmmo,m.pendingHeal,m.technology?.completed,m.technology?.total,radar?status.radarMap?.tracks:undefined]);
    if(key===lastDisplay)return;lastDisplay=key;
    dc.fillStyle="#101916";dc.fillRect(0,0,768,224);dc.strokeStyle=GOLD;dc.lineWidth=4;dc.strokeRect(4,4,760,216);
    function text(v:string,x:number,y:number,color="#f4f3e8",size=32){dc.fillStyle=color;dc.font="bold "+size+"px sans-serif";dc.textAlign="center";dc.textBaseline="middle";dc.fillText(v,x,y);}
    function bar(x:number,y:number,w:number,value:number,max:number,color:string){dc.fillStyle="#35413e";dc.fillRect(x,y,w,8);dc.fillStyle=color;dc.fillRect(x,y,w*Math.min(1,Math.max(0,value/max)),8);}
    if(radar&&status.radarMap){
      const map=status.radarMap;
      if(radarSource!==map.image){radarSource=map.image;radarImage=new Image();radarImage.onload=()=>{lastDisplay="";};radarImage.src=map.image;}
      if(radarImage?.complete&&radarImage.naturalWidth)dc.drawImage(radarImage,174,4,420,216);
      for(const r of map.tracks){dc.globalAlpha=r.stale?.45:1;dc.fillStyle=r.team==="red"?RED:BLUE;dc.beginPath();dc.arc(174+(14-r.x)*15,4+(7.5-r.z)*14.4,9,0,Math.PI*2);dc.fill();text(r.number,174+(14-r.x)*15,4+(7.5-r.z)*14.4,"#101916",14);}
      dc.globalAlpha=1;
      for(const [team,info] of Object.entries(map.summary)){const x=team==="red"?86:682,tint=team==="red"?RED:BLUE;text("⌖",x,60,tint,42);text(String(info.doubleUntil||info.opportunities),x,112,tint);}
    }else{
      text("♥ "+a.base,153,31,RED);text("♥ "+b.base,615,31,BLUE);bar(24,54,258,a.base,10000,RED);bar(486,54,258,b.base,10000,BLUE);
      text("⚑ "+a.outpost,153,87,a.outpostOwner==="red"?RED:BLUE,26);text("⚑ "+b.outpost,615,87,b.outpostOwner==="red"?RED:BLUE,26);
      for(const [side,x] of [[a,153],[b,615]] as const){const q=side.outpostArea;text(q.contested?"Ⅱ":q.full?"◆":"◇",x,119,q.contested?GOLD:q.controller==="red"?RED:BLUE,28);bar(x-55,137,110,q.progress,50,q.controller==="red"?BLUE:RED);}
      const clock=status.countdown?String(status.countdown):m.phase==="finished"?(m.winner==="draw"?"=":"◆"):String(Math.floor(m.seconds/60)).padStart(2,"0")+":"+String(m.seconds%60).padStart(2,"0");
      text(clock,384,57,m.phase==="finished"?(m.winner==="red"?RED:m.winner==="blue"?BLUE:"#fff"):"#fff",45);
      if(focus){const tint=focus.team==="red"?RED:BLUE;text(focus.number+" ♥ "+m.hp+"/"+m.maxHp,162,173,tint,25);text("◉ "+m.ammo+(m.reserve?"+"+m.reserve:""),384,173,"#f4f3e8",25);text(m.heatLimit?"♨ "+m.heat+"/"+m.heatLimit:"",610,173,m.thermalLock?RED:"#f4f3e8",25);if(m.power)bar(24,203,720,m.power.buffer,60,GOLD);if(m.revival?.dead)bar(24,203,720,m.revival.progress,1,BLUE);if(m.technology?.level)bar(24,203,720,m.technology.completed,m.technology.total,GOLD);}
      else{text("◈ "+(a.coins??"—"),153,173,RED,25);text("◈ "+(b.coins??"—"),615,173,BLUE,25);}
    }
    displayTexture.needsUpdate=true;
  }
  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),offset=new THREE.Vector3(),forward=new THREE.Vector3();
  let page=0,lastPanel:string|null=null;
  function update(camera:THREE.PerspectiveCamera,state:{guided:boolean;active:boolean;paused:boolean;take:boolean;driving:boolean;done:boolean;view:string;experiment:boolean;completed:boolean;settings:ArenaSettings;nearby:boolean;panel:"settings"|"actions"|null;status:ArenaStatus;extra:WorldCommand[];radar:boolean}){
    anchor.visible=!state.experiment&&!state.active&&!state.guided&&!state.driving&&state.view==="first";
    camera.getWorldDirection(forward);
    const accessible=anchor.visible&&camera.position.distanceTo(anchor.position)<=3.5&&offset.copy(anchor.position).sub(camera.position).normalize().dot(forward)>.5;
    remote.visible=!state.experiment;
    lesson.draw(fixed("territory",state.completed?"✓":"◎"));
    let commands:WorldCommand[];
    if(state.panel!==lastPanel){page=0;lastPanel=state.panel;}
    if(state.guided)commands=(state.take?["take","replay","explore"]:state.done?["replay","explore"]:[state.paused?"resume":"pause","replay","explore"]).map(id=>fixed(id as WorldAction));
    else if(state.panel){
      const size=6,max=Math.max(0,Math.ceil(state.extra.length/size)-1);page=Math.min(page,max);
      commands=state.extra.slice(page*size,(page+1)*size);
      if(page>0)commands.push({id:"previous",symbol:"‹",run:()=>{page--;}});
      if(page<max)commands.push({id:"next",symbol:"›",run:()=>{page++;}});
      commands.push(fixed("close"));
    }else{
      commands=[];
      if(state.take)commands.push(fixed("take"));
      if(state.driving||state.nearby&&!state.active)commands.push(fixed("interact"));
      if(state.active){if(state.status.match?.phase!=="finished")commands.push(fixed(state.paused?"resume":"pause"));commands.push(fixed("replay"),fixed("explore"));}
      else if(!accessible)commands.push(fixed("match"),fixed("explore"));
      if(!state.driving&&!accessible)commands.push(fixed("view"));
      if(state.extra.length)commands.push(fixed("actions"));
      if(!accessible)commands.push(fixed("settings"));
      commands.push(fixed("exit"));
    }
    // Guided controls retain their original screen position and touch targets.
    const columns=state.guided?3:camera.aspect<.8?4:7;
    const halfHeight=1.5*Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    remote.quaternion.copy(camera.quaternion);
    remote.position.copy(camera.position).add(offset.set(0,-halfHeight*((state.guided?state.driving:state.view==="first"||state.view==="third")&&camera.aspect<.8?.53:.79),-1.5).applyQuaternion(camera.quaternion));
    remote.scale.setScalar(Math.min(halfHeight*.42,halfHeight*camera.aspect*(state.guided?.72:.62)));
    for(let i=0;i<slots.length;i++){
      const b=slots[i],c=commands[i];b.mesh.visible=!!c;b.command=c??null;if(!c)continue;
      b.mesh.name="world-"+c.id;b.draw(c);
      const row=Math.floor(i/columns),n=Math.min(columns,commands.length-row*columns);
      b.mesh.position.set((i%columns-(n-1)/2)*.43,row*.43,0);
    }
    remoteHousing.visible=!state.guided&&commands.length>0;
    if(remoteHousing.visible){const rows=Math.ceil(commands.length/columns);remoteHousing.scale.set(Math.min(columns,commands.length)*.43+.06,rows*.43+.03,.8);remoteHousing.position.set(0,(rows-1)*.215,-.11);}
    instrument.visible=!state.guided&&!state.experiment&&(state.active||state.driving||!!state.status.focus||state.radar);
    if(instrument.visible){drawDisplay(state.status,state.radar);instrument.quaternion.copy(camera.quaternion);instrument.position.copy(camera.position).add(offset.set(0,halfHeight*.80,-1.5).applyQuaternion(camera.quaternion));instrument.scale.setScalar(Math.min(halfHeight*1.16,halfHeight*camera.aspect*1.85));instrument.updateMatrixWorld(true);}
    anchor.updateMatrixWorld(true);remote.updateMatrixWorld(true);
  }
  function pick(camera:THREE.PerspectiveCamera,x=0,y=0){
    ray.setFromCamera(ndc.set(x,y),camera);
    const candidates=buttons.filter(b=>b.command&&b.mesh.visible&&b.mesh.parent?.visible);
    const hit=ray.intersectObjects(candidates.map(b=>b.mesh),false)[0];
    if(!hit||hit.object.parent===anchor&&hit.distance>3.5)return null;
    return candidates.find(b=>b.mesh===hit.object)?.command??null;
  }
  function targets(camera:THREE.PerspectiveCamera){
    const point=new THREE.Vector3();
    return Object.fromEntries(buttons.flatMap(b=>{
      if(!b.command||!b.mesh.visible||!b.mesh.parent?.visible)return [];
      b.mesh.getWorldPosition(point).project(camera);
      if(Math.abs(point.x)>1||Math.abs(point.y)>1||point.z>1||point.z< -1||pick(camera,point.x,point.y)?.id!==b.command.id)return [];
      return [[b.command.id,[(point.x+1)/2,(1-point.y)/2]]];
    }));
  }
  return {update,pick,targets,dispose(){anchor.removeFromParent();remote.removeFromParent();instrument.removeFromParent();buttonGeometry.dispose();housingGeometry.dispose();housingMaterial.dispose();remoteHousing.material.dispose();for(const b of buttons){b.material.dispose();b.texture.dispose();}displayMesh.geometry.dispose();displayMaterial.dispose();displayTexture.dispose();}};
}
