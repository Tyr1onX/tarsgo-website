import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { salonContent } from "./salon-content.ts";

const href = "https://www.aidaxue.com/activity/cyber-maker?ch=ai_daxue_AStudio_JLuniversity";
const leading = `[报名参与 AI 创作活动](${href})`;
test("online lead action retains the exact channel URL and does not repeat it in the body", () => {
  assert.deepEqual(salonContent(`${leading}\n\n活动介绍\n\n[其他链接](https://example.com)`, true), {
    action: { label: "报名参与 AI 创作活动", href }, summary: "活动介绍\n\n[其他链接](https://example.com)",
  });
  assert.equal(salonContent(`${leading}\r\n\r\n正文`, true).summary, "正文");
});
test("ordinary online content and all offline content retain their original rendering", () => {
  for (const [summary, online] of [[leading + "\n\n正文", false], ["介绍\n\n" + leading, true], ["介绍", true]]) {
    assert.deepEqual(salonContent(summary, online), { summary, action: null });
  }
});
test("unsafe or malformed lead links never become an action", () => {
  for (const url of ["javascript:alert(1)", "http://example.com", "https://user:password@example.com", "https:///", "https://example.com\nother"]) {
    const summary = `[报名](${url})\n\n正文`;
    assert.deepEqual(salonContent(summary, true), { summary, action: null });
  }
});
test("first salon configuration follows registration, preparation, teaching, submission and sharing", async () => {
  const event = JSON.parse(await fs.readFile(new URL("../../../../docs/events/ai-salon-01.json", import.meta.url)));
  const content = salonContent(event.summary, event.online);
  assert.equal(content.action.href, href);
  assert.equal(content.action.label, "报名参与 AI 创作活动");
  const steps = ["注册报名", "安装准备", "线上参与", "创作与提交", "交流分享"].map(s => content.summary.indexOf(`**${s}**`));
  assert(steps.every((value, i) => value >= 0 && (i === 0 || value > steps[i - 1])));
  assert.doesNotMatch(content.summary, /自愿报名|相互独立|不是.*前置条件|45 分钟内(?:一定|即可|保证).*完成/);
});
