import test from "node:test";
import assert from "node:assert/strict";
import {statSync} from "node:fs";
import {DEFAULT_ARENA_SETTINGS,normalizeArenaSettings,arenaPixelRatio,loadArenaSettings} from "./rmuc-3d-settings.ts";
import {CAD_MODELS} from "./rmul-3d-cad-assets.ts";
import {MECHANISM_ASSET,CORE_ASSET,DART_ASSET} from "./rmuc-3d-mechanisms.ts";
test("invalid or unavailable local settings fall back to safe defaults",()=>{
  assert.deepEqual(normalizeArenaSettings(null),DEFAULT_ARENA_SETTINGS);
  assert.deepEqual(normalizeArenaSettings({quality:"invalid",muted:"yes",volume:-5,sensitivity:12,invertY:1}),{quality:"auto",muted:false,volume:0,sensitivity:2,invertY:false});
  assert.deepEqual(loadArenaSettings(),DEFAULT_ARENA_SETTINGS);
});
test("quality recommendations cap only the rendering pixel ratio",()=>{
  assert.equal(arenaPixelRatio("auto",3,4),1);
  assert.equal(arenaPixelRatio("auto",3,8,4),1);
  assert.equal(arenaPixelRatio("auto",3,8,8),1.5);
  assert.equal(arenaPixelRatio("low",3,8),1);
  assert.equal(arenaPixelRatio("medium",3,8),1.5);
  assert.equal(arenaPixelRatio("high",3,8),2);
  assert.equal(arenaPixelRatio("high",1,8),1);
});
test("download totals match the actual pinned compressed files",()=>{
  for(const asset of [CAD_MODELS.rmucField,MECHANISM_ASSET,CORE_ASSET,DART_ASSET]){
    assert.equal(statSync(new URL(`../../../../public${asset.url}`,import.meta.url)).size,asset.bytes);
  }
});
