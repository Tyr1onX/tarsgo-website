import assert from "node:assert/strict";
import {test} from "node:test";
import {COURSES,KNOWLEDGE,knowledgeForObject,RULE_VERSION} from "./rmuc-academy.ts";
import {ARENA_ZONES} from "./rmuc-3d-zones.ts";
import {GROUND_ROSTER} from "./rmuc-3d-identity.ts";
test("academy has six versioned courses and referenced questions",()=>{
 assert.equal(COURSES.length,6);
 assert.equal(new Set(COURSES.map(c=>c.id)).size,6);
 assert.match(RULE_VERSION,/V1\.0\.0/);
 for(const c of COURSES){
  assert.ok(c.version>0);
  assert.ok(c.practice||c.questions.length);
  for(const id of c.knowledge)assert.ok(KNOWLEDGE[id]);
  for(const q of c.questions){assert.ok(KNOWLEDGE[q.knowledge]);assert.ok(q.options[q.answer]);assert.equal(new Set(q.options).size,q.options.length);}
 }
 for(const k of Object.values(KNOWLEDGE))assert.match(k.reference,/印刷页/);
});
test("atlas maps existing zones, roster and symmetric special systems",()=>{
 for(const z of ARENA_ZONES)assert.equal(knowledgeForObject(z.id),z.kind);
 for(const r of GROUND_ROSTER)assert.equal(knowledgeForObject(r.id),r.kind);
 for(const team of ["red","blue"]){
  for(const kind of ["air","dart","radar"])assert.equal(knowledgeForObject(team+"-"+kind),kind);
  assert.equal(knowledgeForObject(team+"-core"),"energy");
 }
 assert.equal(knowledgeForObject("unknown"),undefined);
});
