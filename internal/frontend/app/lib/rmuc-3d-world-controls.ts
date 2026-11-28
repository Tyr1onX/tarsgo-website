import * as THREE from "three";

export type WorldAction="territory"|"match"|"pause"|"resume"|"replay"|"explore"|"take"|"view"|"settings"|"actions"|"interact"|"exit"|"close"|"lessonStart"|"radar"|"free"|"robots";
export type WorldCommand={id:string;symbol:string;label:string;detail?:string;color?:string;selected?:boolean;disabled?:boolean;run:()=>void};
const icons:Record<WorldAction,string>={territory:"◎",lessonStart:"▶",match:"▶",pause:"Ⅱ",resume:"▶",replay:"↻",explore:"⌂",take:"✥",view:"◉",settings:"⚙",actions:"✣",interact:"↔",exit:"⏻",close:"×",radar:"⌖",free:"↗",robots:"▣"};
const labels:Record<WorldAction,string>={territory:"教学目录",lessonStart:"开始学习",match:"开始比赛",pause:"暂停",resume:"继续",replay:"重播",explore:"返回控制区",free:"自由探索",robots:"机器人选择",take:"接管机器人",view:"切换视角",settings:"比赛设置",actions:"机器人操作",interact:"上下机器人",exit:"退出战场",close:"返回",radar:"雷达地图"};
const descriptions:Record<string,string>={match:"启动完整的420秒模拟比赛",take:"控制当前选中的机器人",explore:"结束当前情境并返回场外",free:"进入正式场地自由探索"};
type Button={mesh:THREE.Mesh;texture:THREE.CanvasTexture;material:THREE.MeshBasicMaterial;command:WorldCommand|null;draw:(c:WorldCommand,hovered?:boolean,pressed?:boolean)=>void};
const GOLD="#d4bc80";
export function worldButton(id:WorldAction,onAction:(action:WorldAction)=>void):WorldCommand{return {id,symbol:icons[id],label:labels[id],run:()=>onAction(id)};}

export function createWorldControls(scene:THREE.Scene,controlZ:number,onAction:(action:WorldAction)=>void){
  const anchor=new THREE.Group();
  scene.add(anchor);
  const buttonGeometry=new THREE.BoxGeometry(.60,.39,.08),housingGeometry=new THREE.BoxGeometry(1,1,.14);
  const housingMaterial=new THREE.MeshStandardMaterial({color:0x35423f,metalness:.48,roughness:.58});
  const buttons:Button[]=[];
  const fixed=(id:WorldAction)=>worldButton(id,onAction);
  function add(parent:THREE.Group,x=0,y=0,command:WorldCommand|null=null){
    const canvas=document.createElement("canvas");canvas.width=384;canvas.height=256;
    const ctx=canvas.getContext("2d")!,texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
    const mesh=new THREE.Mesh(buttonGeometry,material);mesh.position.set(x,y,0);parent.add(mesh);
    let previous="";
    function draw(c:WorldCommand,hovered=false,pressed=false){
      const label=c.label,selected=c.selected??c.detail==="✓";
      const key=[c.symbol,label,c.detail,c.color,selected,c.disabled,hovered,pressed].join("|");if(previous===key)return;previous=key;
      ctx.fillStyle=c.disabled?"#303634":pressed?"#63502d":hovered?"#48533d":selected?"#354a43":c.id==="match"?"#423722":"#182624";ctx.fillRect(0,0,384,256);
      ctx.strokeStyle=c.disabled?"#68716c":hovered?"#ffe5a8":selected?"#90d0aa":GOLD;ctx.lineWidth=hovered?9:5;ctx.strokeRect(5,5,374,246);
      ctx.fillStyle=c.disabled?"#a4aca8":c.color??"#f7f4e9";ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.font="bold 53px sans-serif";ctx.fillText(c.symbol,192,c.detail?56:65,330);
      ctx.font="bold 54px sans-serif";ctx.fillText(label,192,c.detail?133:162,350);
      if(c.detail){ctx.font="bold 35px sans-serif";ctx.fillText(c.detail,192,209,340);}
      texture.needsUpdate=true;
    }
    const b={mesh,texture,material,command,draw};buttons.push(b);
    if(command){mesh.name="world-"+command.id;draw(command);}else mesh.visible=false;
    return b;
  }
  // Concourse in front of the long-side stands, outside the CAD and rails.
  anchor.position.set(0,1.52,controlZ);
  const backing=new THREE.Mesh(housingGeometry,housingMaterial);backing.scale.set(2.26,1.13,1.14);backing.position.set(0,-.25,-.11);anchor.add(backing);
  for(const x of [-.76,.76]){
    const leg=new THREE.Mesh(housingGeometry,housingMaterial);leg.scale.set(.16,.59,1.8);leg.position.set(x,-1.06,-.25);anchor.add(leg);
  }
  const foot=new THREE.Mesh(housingGeometry,housingMaterial);foot.scale.set(2.35,.09,4);foot.position.set(0,-1.37,-.19);anchor.add(foot);
  add(anchor,-.72,0,fixed("match"));const lesson=add(anchor,0,0,fixed("territory"));add(anchor,.72,0,fixed("robots"));
  add(anchor,-.72,-.52,fixed("free"));add(anchor,0,-.52,fixed("settings"));add(anchor,.72,-.52,fixed("exit"));
  const ray=new THREE.Raycaster(),renderedCamera=new THREE.PerspectiveCamera(),ndc=new THREE.Vector2(),offset=new THREE.Vector3(),forward=new THREE.Vector3(),point=new THREE.Vector3();
  let anchorEnabled=false;
  function accessible(camera:THREE.PerspectiveCamera,inControl:boolean){
    camera.getWorldDirection(forward);
    if(!inControl||camera.position.distanceTo(anchor.position)>3.5||offset.copy(anchor.position).sub(camera.position).normalize().dot(forward)<=.5)return false;
    camera.updateMatrixWorld(true);
    anchor.updateMatrixWorld(true);
    return buttons.every(b=>{
      b.mesh.getWorldPosition(point);
      if(point.distanceTo(camera.position)>3.5)return false;
      point.project(camera);
      return Math.abs(point.x)<.95&&Math.abs(point.y)<.95&&Math.abs(point.z)<1;
    });
  }
  function update(camera:THREE.PerspectiveCamera,inControl:boolean,completed:boolean){
    anchorEnabled=accessible(camera,inControl);
    lesson.command={...fixed("territory"),symbol:completed?"✓":"◎"};
    anchor.updateMatrixWorld(true);
    renderedCamera.copy(camera,false);
  }
  function hitButton(x=0,y=0){
    ray.setFromCamera(ndc.set(x,y),renderedCamera);
    const candidates=buttons.filter(b=>b.command&&b.mesh.visible&&b.mesh.parent?.visible&&(b.mesh.parent!==anchor||anchorEnabled));
    const hit=ray.intersectObjects(candidates.map(b=>b.mesh),false)[0];
    if(!hit||hit.object.parent===anchor&&hit.distance>3.5)return null;
    return candidates.find(b=>b.mesh===hit.object)??null;
  }
  function pick(x=0,y=0){
    const command=hitButton(x,y)?.command;
    return command??null;
  }
  function feedback(point:{x:number;y:number}|null,pressed:string|null){
    const hit=point?hitButton(point.x,point.y):null;
    for(const b of buttons)if(b.command&&b.mesh.visible&&b.mesh.parent?.visible)b.draw(b.command,b===hit,!!pressed&&b.command.id===pressed);
    const c=hit?.command;
    return c?{label:c.label,description:c.disabled?"当前不可执行":descriptions[c.id],disabled:!!c.disabled}:null;
  }
  function targets(){
    const point=new THREE.Vector3();
    return Object.fromEntries(buttons.flatMap(b=>{
      if(!b.command||b.command.disabled||!b.mesh.visible||!b.mesh.parent?.visible||b.mesh.parent===anchor&&!anchorEnabled)return [];
      b.mesh.getWorldPosition(point).project(renderedCamera);
      if(Math.abs(point.x)>1||Math.abs(point.y)>1||point.z>1||point.z< -1||pick(point.x,point.y)?.id!==b.command.id)return [];
      return [[b.command.id,[(point.x+1)/2,(1-point.y)/2]]];
    }));
  }
  return {update,accessible,pick,feedback,targets,dispose(){anchor.removeFromParent();buttonGeometry.dispose();housingGeometry.dispose();housingMaterial.dispose();for(const b of buttons){b.material.dispose();b.texture.dispose();}}};
}
