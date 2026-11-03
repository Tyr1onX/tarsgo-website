import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.TARSGO_PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.TARSGO_SALON_BROWSER_BASE || "http://127.0.0.1:8194";
if (new URL(base).hostname !== "127.0.0.1")
  throw new Error("Local synthetic browser server required");
const out = process.cwd() + "/docs/qa/ai-salon";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.TARSGO_CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--no-sandbox"],
});
const checks = [];
const contexts = [];
const errors = [];
async function page(actor, mobile = false) {
  const c = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
  });
  contexts.push(c);
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  if (actor !== null) {
    await p.goto(base + "/login");
    await p
      .getByLabel("邮箱", { exact: true })
      .fill(`salon-browser-${actor}@tarsgo.test`);
    await p.getByLabel("密码", { exact: true }).fill("SyntheticSalonOnly123!");
    await p.getByRole("button", { name: "登录", exact: true }).click();
    await p.waitForURL(/dashboard/);
  }
  return p;
}
const bj = (d) =>
  new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 16);
async function field(p, label, value) {
  await p.getByLabel(label, { exact: true }).fill(value);
}
async function fillProfile(p, name, id) {
  await field(p, "真实姓名", name);
  await p
    .getByLabel("学院", { exact: true })
    .selectOption({ label: "其他学院" });
  await field(p, "学院名称", "自定义测试学院");
  await field(p, "年级", "2026级");
  await field(p, "学号", id);
  await field(p, "校区", "南岭校区");
  await p.getByLabel("性别", { exact: true }).selectOption("1");
}
async function registered(p, status) {
  await p
    .getByRole("paragraph")
    .filter({ hasText: new RegExp(`^${status}$`) })
    .waitFor();
}
try {
  const anon = await page(null);
  await anon.goto(base + "/programs");
  await anon.getByRole("heading", { name: "基地项目", exact: true }).waitFor();
  assert.equal(
    await anon
      .getByRole("link", { name: /低空智能感知与控制微专业/ })
      .getAttribute("href"),
    "/micro-specialties/low-altitude-intelligent-sensing-control",
  );
  await anon.screenshot({
    path: out + "/programs-desktop.png",
    fullPage: true,
  });
  checks.push("匿名项目入口、微专业原地址");
  const admin = await page(0);
  await admin.goto(base + "/programs/ai-salon");
  await admin.getByRole("link", { name: "管理活动", exact: true }).click();
  await admin.getByRole("button", { name: "创建活动", exact: true }).click();
  const now = new Date();
  await field(admin, "标题", "[TEST] 吉甲 AI 沙龙 · 线下实践");
  await field(
    admin,
    "简介",
    "从想法到实践，交流 AI 工具与机器人应用。\n这是本地隔离环境的虚构活动。",
  );
  await field(admin, "开始时间（北京时间）", bj(new Date(+now + 3600000)));
  await field(admin, "结束时间（北京时间）", bj(new Date(+now + 7200000)));
  await field(admin, "报名截止时间（北京时间）", bj(new Date(+now + 1800000)));
  await field(admin, "人数上限", "1");
  await field(admin, "地点", "南岭校区 · 测试教室");
  await admin.getByLabel("发布活动", { exact: true }).check();
  await admin.getByRole("button", { name: "保存活动", exact: true }).click();
  await admin.getByRole("status").filter({ hasText: "活动已保存" }).waitFor();
  await anon.goto(base + "/programs/ai-salon");
  await anon.getByRole("link", { name: /吉甲 AI 沙龙 · 线下实践/ }).click();
  await anon.getByRole("heading", { name: "线下报名" }).waitFor();
  await anon.getByRole("paragraph").filter({ hasText: "登录后报名" }).waitFor();
  const detail = anon.url();
  const id = detail.split("/").pop();
  assert(!(await anon.getByText("人数上限").count()));
  checks.push("超级管理员创建发布、匿名查看活动、未公开报名人数");
  const a = await page(1);
  const b = await page(2, true);
  const c = await page(3);
  const d = await page(4);
  const ordinaryAdmin = await page(5);
  await ordinaryAdmin.goto(base + "/programs/ai-salon/manage");
  await ordinaryAdmin
    .getByRole("alert")
    .filter({ hasText: "仅超级管理员" })
    .waitFor();
  assert.equal(
    await ordinaryAdmin
      .getByRole("button", { name: "创建活动", exact: true })
      .count(),
    0,
  );
  checks.push("普通管理员浏览器管理隔离");
  await a.goto(detail);
  await fillProfile(a, "甲测试同学", "SALON001");
  await a.getByRole("button", { name: "提交报名", exact: true }).click();
  await registered(a, "已报名");
  await a.reload();
  await registered(a, "已报名");
  await a.getByText("SALON001", { exact: true }).waitFor();
  await a.screenshot({ path: out + "/registered-desktop.png", fullPage: true });
  checks.push("普通账号无战队身份报名、返回页面显示报名及资料");
  await b.goto(detail);
  await fillProfile(b, "乙测试同学", "SALON001");
  await b.getByRole("button", { name: "提交报名", exact: true }).click();
  await b.getByRole("alert").filter({ hasText: "该学号已报名" }).waitFor();
  await field(b, "学号", "SALON002");
  await b.getByRole("button", { name: "提交报名", exact: true }).click();
  await registered(b, "候补中");
  assert.equal(
    await b.getByRole("button", { name: "签到", exact: true }).count(),
    0,
  );
  assert(!/排位|第\s*\d+\s*位/.test(await b.locator("main").innerText()));
  assert(
    await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await b.screenshot({ path: out + "/waitlist-mobile.png", fullPage: true });
  checks.push("学号重复拒绝、满员候补、候补无签到与排位、移动端无横向溢出");
  await c.goto(detail);
  await fillProfile(c, "丙测试同学", "SALON003");
  await c.getByRole("button", { name: "提交报名", exact: true }).click();
  await registered(c, "候补中");
  b.once("dialog", (x) => x.accept());
  await b.getByRole("button", { name: "取消报名", exact: true }).click();
  await b.getByRole("button", { name: "提交报名", exact: true }).waitFor();
  assert.equal(await b.getByLabel("学院名称").inputValue(), "自定义测试学院");
  await b.getByRole("button", { name: "提交报名", exact: true }).click();
  await registered(b, "候补中");
  a.once("dialog", (x) => x.accept());
  await a.getByRole("button", { name: "取消报名", exact: true }).click();
  await a.getByRole("button", { name: "提交报名", exact: true }).waitFor();
  await c.reload();
  await registered(c, "已报名");
  await b.reload();
  await registered(b, "候补中");
  checks.push("正式与候补取消、取消后重排、按候补顺序自动补位");
  await admin.getByRole("button", { name: "编辑", exact: true }).click();
  await field(admin, "人数上限", "2");
  await admin.getByRole("button", { name: "保存活动", exact: true }).click();
  await admin.getByRole("status").filter({ hasText: "活动已保存" }).waitFor();
  await b.reload();
  await registered(b, "已报名");
  checks.push("管理员扩容自动补位");
  await admin
    .getByRole("button", { name: "提前关闭报名", exact: true })
    .click();
  await admin
    .getByRole("status")
    .filter({ hasText: "已提前关闭报名" })
    .waitFor();
  await d.goto(detail);
  await d.getByRole("paragraph").filter({ hasText: "报名已关闭" }).waitFor();
  await admin
    .getByRole("button", { name: "重新开放报名", exact: true })
    .click();
  await admin
    .getByRole("status")
    .filter({ hasText: "已重新开放报名" })
    .waitFor();
  await d.reload();
  await fillProfile(d, "丁测试同学", "SALON004");
  await d.getByRole("button", { name: "提交报名", exact: true }).click();
  await registered(d, "候补中");
  checks.push("提前关闭和重新开放报名");
  await b.getByRole("link", { name: "我的报名 →", exact: true }).click();
  await b.getByRole("heading", { name: "我的报名", exact: true }).waitFor();
  await field(b, "学院名称", "资料修改学院");
  await field(b, "年级", "2027级");
  await b.getByRole("button", { name: "保存个人资料", exact: true }).click();
  await b.getByRole("status").filter({ hasText: "个人资料已保存" }).waitFor();
  await b.getByText("报名信息", { exact: true }).first().click();
  assert.match(
    await b.locator('section[aria-label="报名记录"]').innerText(),
    /自定义测试学院/,
  );
  assert.equal(await b.getByLabel("学院名称").inputValue(), "资料修改学院");
  checks.push("报名历史、个人资料同步、报名快照保留");
  await admin.getByRole("button", { name: "编辑", exact: true }).click();
  await field(admin, "开始时间（北京时间）", bj(new Date(Date.now() - 120000)));
  await field(
    admin,
    "报名截止时间（北京时间）",
    bj(new Date(Date.now() - 180000)),
  );
  await admin.getByRole("button", { name: "保存活动", exact: true }).click();
  await admin.getByRole("status").filter({ hasText: "活动已保存" }).waitFor();
  await c.reload();
  await registered(c, "已报名");
  assert(
    await c.getByRole("button", { name: "取消报名", exact: true }).isDisabled(),
  );
  await c.getByRole("button", { name: "签到", exact: true }).click();
  await c
    .getByRole("paragraph")
    .filter({ hasText: /^已签到 ·/ })
    .waitFor();
  assert.equal(
    await c.getByRole("button", { name: "签到", exact: true }).count(),
    0,
  );
  await d.reload();
  await registered(d, "候补中");
  assert.equal(
    await d.getByRole("button", { name: "签到", exact: true }).count(),
    0,
  );
  assert(
    await d.getByRole("button", { name: "取消报名", exact: true }).isDisabled(),
  );
  checks.push("截止后取消关闭、活动中签到一次、候补不可签到");
  await admin.getByRole("button", { name: "名单与统计", exact: true }).click();
  await admin.getByRole("heading", { name: /名单与统计/ }).waitFor();
  await admin
    .getByText("已报名 2 · 候补 1 · 已签到 1", { exact: true })
    .waitFor();
  await admin.getByLabel("筛选名单", { exact: true }).selectOption("checked");
  assert.equal(await admin.locator("details").count(), 1);
  const downloadEvent = admin.waitForEvent("download");
  await admin.getByRole("button", { name: "导出名单", exact: true }).click();
  const download = await downloadEvent;
  await download.saveAs(out + "/synthetic-roster.csv");
  const csv = await fs.readFile(out + "/synthetic-roster.csv", "utf8");
  assert.match(csv, /丙测试同学/);
  assert.match(csv, /签到时间/);
  await admin.screenshot({
    path: out + "/admin-roster-desktop.png",
    fullPage: true,
  });
  checks.push("报名候补签到统计、签到名单筛选、真实下载CSV");
  // Confirm the API protections in the same browser session, without mutating users.
  const unauthorized = await ordinaryAdmin.evaluate(async () => ({
    roster: (await fetch("/api/admin/ai-salon/events")).status,
  }));
  assert.equal(unauthorized.roster, 403);
  await anon.goto(detail);
  assert(!(await anon.getByText("SALON003", { exact: true }).count()));
  await admin.setViewportSize({ width: 390, height: 844 });
  assert(
    await admin.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await admin.screenshot({ path: out + "/admin-mobile.png", fullPage: true });
  checks.push("管理移动端无溢出、公开页面无私人信息");
  await admin.setViewportSize({ width: 1440, height: 1000 });
  admin.once("dialog", (x) => x.accept());
  await admin.getByRole("button", { name: "删除", exact: true }).click();
  await admin.getByRole("status").filter({ hasText: "活动已删除" }).waitFor();
  await a.goto(detail);
  await a.getByRole("alert").filter({ hasText: "活动或记录不存在" }).waitFor();
  await c.goto(base + "/programs/ai-salon/registrations");
  await c.getByText("暂无报名记录", { exact: true }).waitFor();
  checks.push("删除活动级联清除报名签到、详情404和个人记录清除");
  assert.deepEqual(errors, []);
  await fs.writeFile(
    out + "/browser-results.json",
    JSON.stringify({ base, checks, pageErrors: errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, pageErrors: errors }, null, 2));
} catch (e) {
  console.error(e);
  for (let i = 0; i < contexts.length; i++) {
    const p = contexts[i].pages()[0];
    if (p)
      await p
        .screenshot({
          path: `/tmp/tarsgo-salon-failure-${i}.png`,
          fullPage: true,
        })
        .catch(() => {});
  }
  throw e;
} finally {
  await browser.close();
}
