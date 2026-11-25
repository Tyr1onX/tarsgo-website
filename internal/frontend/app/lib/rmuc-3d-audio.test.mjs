import assert from "node:assert/strict";
import {test} from "node:test";
import {PerspectiveCamera} from "three";
import {createMatchAudio,cueSamples,eventCue,audioVisible,spatialGain} from "./rmuc-3d-audio.ts";
test("original synthesized cues are finite, bounded, repeatable and distinct",()=>{
 const light=cueSamples("light",48000),heavy=cueSamples("heavy",48000);
 assert.notEqual(light.length,heavy.length);
 assert.deepEqual(light,cueSamples("light",48000));
 assert.ok([...light,...heavy].every(x=>Number.isFinite(x)&&Math.abs(x)<=1));
 assert.ok(spatialGain(2)>spatialGain(12));
 assert.equal(audioVisible("red","blue"),false);
 assert.equal(audioVisible("red","all"),true);
 assert.equal(eventCue({type:"ammo",status:"requested",amount:100}),null);
 assert.equal(eventCue({type:"assembly-step-start"}),null);
 assert.equal(eventCue({type:"assembly-step-complete"}),"assembly");
 assert.equal(eventCue({type:"assembly-end",reason:"cancelled"}),null);
});
test("native audio lifecycle has no queued cues; mute and disposal stop and disconnect voices",()=>{
 let started=0,stopped=0,closed=0,disconnected=0,context;
 const node=()=>({connect(){},disconnect(){disconnected++;}});
 globalThis.document={hidden:false};
 globalThis.AudioContext=class{
  constructor(){context=this;this.state="running";this.sampleRate=8000;this.currentTime=0;this.destination={};}
  createBuffer(_,len){const data=new Float32Array(len);return {getChannelData:()=>data};}
  createBufferSource(){return {...node(),start(){started++;},stop(){stopped++;}};}
  createGain(){return {...node(),gain:{value:0}};}
  createStereoPanner(){return {...node(),pan:{value:0}};}
  createDynamicsCompressor(){return {...node(),threshold:{value:0},ratio:{value:0}};}
  close(){closed++;this.state="closed";return Promise.resolve();}
 };
 try{
  const a=createMatchAudio(new PerspectiveCamera());
  a.play("light");assert.equal(started,0);
  a.unlock();a.play("light");a.play("light");assert.equal(started,1);
  for(let i=0;i<50;i++){context.currentTime+=.2;a.play("heavy");}
  assert.equal(a.activeCount,9);
  context.currentTime+=1;a.play("major");assert.equal(a.activeCount,10);
  a.setEnabled(false);assert.equal(a.activeCount,0);assert.equal(stopped,10);assert.ok(disconnected>=30);
  a.play("major");assert.equal(started,10);
  a.setEnabled(true);document.hidden=true;a.play("light");assert.equal(started,10);
  document.hidden=false;a.play("start");assert.equal(started,11);
  a.dispose();assert.equal(closed,1);assert.equal(a.activeCount,0);a.unlock();a.play("start");assert.equal(started,11);
 }finally{delete globalThis.document;delete globalThis.AudioContext;}
});
