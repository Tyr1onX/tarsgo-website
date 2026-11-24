// RMUC 2027 Rule Manual V1.0.0 §5.7.4, tables 5-29/30.
// The referee alone compares a reported coordinate with ground truth.
export type RadarTeam = "red"|"blue";
export type RadarPoint = {x:number;z:number};
export type RadarRobot = {id:string;team:RadarTeam;hp:number};
export type RadarTrack = {progress:number;delta:number;correct:boolean;nextLoss:number;report:RadarPoint|null;reportedAt:number|null};
export type RadarSide = {tracks:Record<string,RadarTrack>;encryptionLevel:1|2|3;vulnerableSeconds:number;used:number;doubleUntil:number};
export type Radar = Record<RadarTeam,RadarSide>;
const teams = ["red","blue"] as const;
const opposite=(team:RadarTeam):RadarTeam=>team==="red"?"blue":"red";
const EPS=1e-8;
export function createRadar(robots:readonly RadarRobot[]):Radar{
  const side=():RadarSide=>({tracks:Object.fromEntries(robots.map(r=>[r.id,{progress:0,delta:0,correct:false,nextLoss:.5,report:null,reportedAt:null}])),encryptionLevel:1,vulnerableSeconds:0,used:0,doubleUntil:0});
  return {red:side(),blue:side()};
}
function apply(track:RadarTrack,error:number){
  const increment=error<.8?1:error<1.6?.5:-.8;
  const correct=increment>0;
  track.delta=(track.correct===correct?track.delta:0)+increment;
  track.correct=correct;
  track.progress=Math.max(0,Math.min(150,track.progress+track.delta));
}
export function submitRadarPosition(radar:Radar,team:RadarTeam,id:string,report:RadarPoint,truth:RadarPoint,time:number){
  const track=radar[team].tracks[id];
  if(!track||![report.x,report.z,truth.x,truth.z,time].every(Number.isFinite))return false;
  // A received report wins a tie with the interruption timer.
  while(track.nextLoss<time-EPS){apply(track,Infinity);track.nextLoss+=.5;}
  apply(track,Math.hypot(report.x-truth.x,report.z-truth.z));
  track.report={...report};track.reportedAt=time;track.nextLoss=time+.5;
  return true;
}
export function radarPosition(radar:Radar,team:RadarTeam,robot:RadarRobot,truth:RadarPoint){
  const track=radar[team].tracks[robot.id];
  if(!track)return null;
  const localized=track.progress>=(robot.team===team?50:100);
  const point=localized?truth:track.report;
  return point?{point:{x:point.x,z:point.z},localized,progress:track.progress,reportedAt:track.reportedAt}:null;
}
export function radarVulnerability(radar:Radar,team:RadarTeam,robot:RadarRobot,time:number){
  if(robot.team===team||robot.hp<=0||radar[robot.team].encryptionLevel>radar[team].encryptionLevel)return 0;
  const p=radar[team].tracks[robot.id]?.progress??0;
  return (p>=120?.2:p>=100?.15:0)*(time<radar[team].doubleUntil?2:1);
}
export function radarOpportunities(side:RadarSide){
  return Math.max(0,Math.min(2,Math.floor((side.vulnerableSeconds+EPS)/60))-side.used);
}
export function activateRadarDouble(radar:Radar,team:RadarTeam,time:number){
  const side=radar[team];
  if(time<side.doubleUntil||!radarOpportunities(side))return false;
  side.used++;side.doubleUntil=time+30;return true;
}
// Count the union of vulnerable time, not the number of simultaneously
// marked targets. Process loss boundaries on the match clock.
export function advanceRadar(radar:Radar,robots:readonly RadarRobot[],before:number,end:number){
  if(end<=before)return;
  for(const team of teams){
    const side=radar[team],tracks=Object.values(side.tracks);
    let now=before;
    while(now<end-EPS){
      const next=Math.min(end,...tracks.map(t=>Math.max(now,t.nextLoss)));
      if(robots.some(r=>radarVulnerability(radar,team,r,now)>0))side.vulnerableSeconds=Math.min(120,side.vulnerableSeconds+next-now);
      now=next;
      for(const t of tracks)if(t.nextLoss<=now+EPS){apply(t,Infinity);t.nextLoss+=.5;}
    }
  }
}
export function resetRadarDelta(radar:Radar,id:string){
  for(const team of teams){const track=radar[team].tracks[id];if(track){track.delta=0;track.correct=false;}}
}
// The 2027 waveform parameters are not published. Only a verified referee
// decode event may raise the encryption level; this is not a virtual decoder.
export function verifiedRadarDecode(radar:Radar,team:RadarTeam){
  const side=radar[team];
  if(side.encryptionLevel===3)return false;
  side.encryptionLevel=(side.encryptionLevel+1) as 2|3;return true;
}
