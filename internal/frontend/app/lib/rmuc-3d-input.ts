export type MoveVector={f:number;r:number};
export const ZERO_MOVE:MoveVector={f:0,r:0};
export function boundedMove(f:number,r:number):MoveVector{
  const scale=Math.max(1,Math.hypot(f,r));
  return {f:f/scale,r:r/scale};
}
export function joystickVector(dx:number,dy:number,radius:number):MoveVector{
  const length=Math.hypot(dx,dy),dead=radius*.12;
  if(length<=dead||radius<=0)return ZERO_MOVE;
  const strength=Math.min(1,(length-dead)/(radius-dead));
  return {f:-dy/length*strength,r:dx/length*strength};
}
export function movementIntent(keys:ReadonlySet<string>,touch:MoveVector=ZERO_MOVE){
  return boundedMove(Number(keys.has("KeyW"))-Number(keys.has("KeyS"))+touch.f,
    Number(keys.has("KeyD"))-Number(keys.has("KeyA"))+touch.r);
}
export function flightIntent(keys:ReadonlySet<string>,touch:MoveVector=ZERO_MOVE){
  return {f:Number(keys.has("KeyW"))-Number(keys.has("KeyS"))+touch.f,r:Number(keys.has("KeyD"))-Number(keys.has("KeyA"))+touch.r,
    u:Number(keys.has("Space"))-Number(keys.has("ShiftLeft")||keys.has("ShiftRight")),boost:keys.has("ControlLeft")||keys.has("ControlRight")};
}
