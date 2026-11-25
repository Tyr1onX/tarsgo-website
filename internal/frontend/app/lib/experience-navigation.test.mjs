import assert from "node:assert/strict";
import test from "node:test";
import { getExperienceReturnTo, experienceReturnLabel, getPixelReturn } from "./experience-navigation.ts";

test("experience return preserves the dashboard page, query and hash", () => {
  const path = "/dashboard/admin/users?q=abc#results";
  assert.equal(getExperienceReturnTo({ experienceReturnTo: path }), path);
  assert.equal(experienceReturnLabel(path), "返回后台");
  assert.equal(getExperienceReturnTo(null), "/");
  assert.equal(getExperienceReturnTo(null, "/pixel-jijia"), "/pixel-jijia");
  assert.equal(experienceReturnLabel("/"), "返回官网");
  assert.equal(experienceReturnLabel("/pixel-jijia"), "返回像素吉甲");
  for (const path of ["//evil.example", "https://evil.example", "/dashboard\\evil", "/dashboardish"]) {
    assert.equal(getExperienceReturnTo({ experienceReturnTo: path }), "/");
  }
});

test("像素场景返回状态只接受有限坐标、合法缩放及站内返回位置",()=>{
  assert.deepEqual(getPixelReturn({pixelReturn:{x:115,y:13,zoom:2.6,parent:"/dashboard"}}),{x:115,y:13,zoom:2.6,parent:"/dashboard"});
  assert.equal(getPixelReturn({pixelReturn:{x:Infinity,y:13,zoom:2.6}}),null);
  assert.equal(getPixelReturn({pixelReturn:{x:115,y:13,zoom:99}}),null);
  assert.equal(getPixelReturn({pixelReturn:{x:115,y:13,zoom:2,parent:"//bad.example"}}).parent,"/");
});
