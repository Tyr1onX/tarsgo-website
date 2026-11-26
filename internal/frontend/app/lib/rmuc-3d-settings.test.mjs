import test from "node:test";
import assert from "node:assert/strict";
import {statSync} from "node:fs";
import {DEFAULT_ARENA_SETTINGS,normalizeArenaSettings,arenaPixelRatio,calibratedArenaPixelRatio,createArenaQualityCalibration,loadArenaSettings} from "./rmuc-3d-settings.ts";
import {CAD_MODELS} from "./rmul-3d-cad-assets.ts";
import {MECHANISM_ASSET,CORE_ASSET,DART_ASSET} from "./rmuc-3d-mechanisms.ts";
test("invalid or unavailable local settings fall back to safe defaults",()=>{
  assert.deepEqual(normalizeArenaSettings(null),DEFAULT_ARENA_SETTINGS);
  assert.deepEqual(normalizeArenaSettings({quality:"invalid",muted:"yes",volume:-5,sensitivity:12,invertY:1}),{quality:"auto",muted:false,volume:0,sensitivity:2,invertY:false});
  assert.deepEqual(loadArenaSettings(),DEFAULT_ARENA_SETTINGS);
});
test("auto starts at the same native-capped resolution as fine; manual modes remain explicit",()=>{
  assert.equal(arenaPixelRatio("auto",3),2);
  assert.equal(arenaPixelRatio("auto",2),2);
  assert.equal(arenaPixelRatio("auto",1.5),1.5);
  assert.equal(arenaPixelRatio("low",3),1);
  assert.equal(arenaPixelRatio("medium",3),1.5);
  assert.equal(arenaPixelRatio("high",3),2);
  assert.equal(arenaPixelRatio("high",1),1);
});
test("download totals match the actual pinned compressed files",()=>{
  for(const asset of [CAD_MODELS.rmucField,MECHANISM_ASSET,CORE_ASSET,DART_ASSET]){
    assert.equal(statSync(new URL(`../../../../public${asset.url}`,import.meta.url)).size,asset.bytes);
  }
});

const window=(raf,gpu)=>({intervals:Array(90).fill(raf),gpu:Array(12).fill(gpu)});
test("automatic calibration preserves resolution when frame rate is unchanged or GPU is not limiting",()=>{
  assert.equal(calibratedArenaPixelRatio(2,window(33,10),window(33,8),window(33,10),true),2);
  assert.equal(calibratedArenaPixelRatio(2,window(33,10),window(20,8),window(33,10),true),2);
  assert.equal(calibratedArenaPixelRatio(2,window(33,25),window(33,23),window(33,25),true),2);
  assert.equal(calibratedArenaPixelRatio(2,window(33,25),window(20,10),window(16,10),true),2);
});
test("only repeatable actual frame-time and GPU gains lower automatic resolution",()=>{
  assert.equal(calibratedArenaPixelRatio(2,window(33,25),window(20,10),window(33,25),true),1.5);
  // Actual 4K CSS / DPR2 browser boundary: RAF remained near 33ms, but GPU improved.
  assert.equal(calibratedArenaPixelRatio(2,window(33.3,18.6),window(33.3,13.3),window(33.3,18.5),true),1.5);
  assert.equal(calibratedArenaPixelRatio(2,window(33.3,18.6),window(40,13.3),window(33.3,18.5),true),2);
  assert.equal(calibratedArenaPixelRatio(1.5,window(33,25),window(20,10),window(33,25),true),1);
  assert.equal(calibratedArenaPixelRatio(2,window(33,25),{...window(20,10),gpu:[]},window(33,25),true),2);
  assert.equal(calibratedArenaPixelRatio(2,window(33,0),window(20,0),window(33,0),false),1.5);
  assert.equal(calibratedArenaPixelRatio(2,window(33,0),window(30,0),window(33,0),false),2);
});
test("calibration uses bounded comparisons with a cooldown; interruption restores original ratio",()=>{
  let ratio=2;const changes=[];
  const renderer={getContext:()=>({getExtension:()=>null}),getPixelRatio:()=>ratio,setPixelRatio:n=>{ratio=n;changes.push(n);}};
  const calibration=createArenaQualityCalibration(renderer);let time=100;
  for(let i=0;i<600;i++){time+=ratio===2?33:20;calibration.beginFrame(time,true,"all");calibration.endFrame();}
  assert.deepEqual(changes,[1.5,2,1.5]);
  calibration.reset();ratio=2;changes.length=0;
  for(let i=0;i<115;i++){time+=33;calibration.beginFrame(time,true,"all");calibration.endFrame();}
  assert.equal(ratio,1.5);calibration.beginFrame(time+33,false,"all");
  assert.equal(ratio,2);
});
test("GPU samples gate trial, and later sustained GPU pressure is not ignored",()=>{
  let ratio=2,gpu=10,query=null,active=false,time=100;const changes=[];
  const ext={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2};
  const gl={getExtension:()=>ext,QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,CURRENT_QUERY:5,
    getQuery:()=>active?query:null,createQuery:()=>({}),beginQuery:(_,q)=>{query=q;active=true;q.ns=gpu*1e6;},
    endQuery:()=>{active=false;},getQueryParameter:(q,key)=>key===3?true:q.ns,getParameter:()=>false,
    deleteQuery:q=>{if(query===q)query=null;}};
  const renderer={getContext:()=>gl,getPixelRatio:()=>ratio,setPixelRatio:n=>{ratio=n;changes.push(n);}};
  const calibration=createArenaQualityCalibration(renderer);
  const frames=(count)=>{for(let i=0;i<count;i++){time+=33.3;calibration.beginFrame(time,true,i%150<75?"all":"detail");calibration.endFrame();}};
  frames(450);assert.deepEqual(changes,[]);
  // Same RAF cadence; only GPU load changes and improves at the lower ratio.
  for(let i=0;i<700;i++){gpu=ratio===2?19:13;frames(1);}
  assert.deepEqual(changes,[1.5,2,1.5]);assert.equal(ratio,1.5);
  calibration.reset();assert.equal(query,null);
});
