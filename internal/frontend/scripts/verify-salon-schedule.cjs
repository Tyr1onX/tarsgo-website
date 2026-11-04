const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
// Start the local frontend first. Playwright is a verification-only dependency.
// Override SALON_TEST_ORIGIN, PLAYWRIGHT_MODULE, or PLAYWRIGHT_EXECUTABLE_PATH as needed.
const origin = process.env.SALON_TEST_ORIGIN || "http://127.0.0.1:5194";
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname),
);
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1080 },
      timezoneId: "America/Los_Angeles",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const saved = [];
    const fixtures = [
      {
        id: 71,
        title: "历史活动",
        summary: "原有简介",
        posterUrl: "",
        startAt: "2026-01-01T06:07:08.123Z",
        endAt: "2026-01-01T07:09:10.456Z",
        deadline: "2025-12-31T09:42:11.789Z",
        capacity: 50,
        location: "南岭",
        published: true,
        registrationClosed: false,
      },
      {
        id: 72,
        title: "跨午夜活动",
        summary: "跨日简介",
        posterUrl: "",
        startAt: "2026-11-03T15:45:12.123Z",
        endAt: "2026-11-03T17:15:45.678Z",
        deadline: "2026-11-02T14:00:00.000Z",
        capacity: 30,
        location: "南岭",
        published: true,
        registrationClosed: false,
      },
    ];
    const mockApi = async (route) => {
      const url = new URL(route.request().url());
      let data = [];
      if (url.pathname === "/api/me")
        data = {
          user: {
            id: 1,
            email: "test@example.com",
            realName: "测试管理员",
            role: { id: 1, name: "super_admin", displayName: "超级管理员" },
          },
        };
      if (url.pathname === "/api/admin/ai-salon/events") data = fixtures;
      if (["PUT", "POST"].includes(route.request().method())) {
        saved.push(route.request().postDataJSON());
        data = saved.at(-1);
      }
      await route.fulfill({ json: { code: 200, message: "操作成功", data } });
    };
    await page.route(`${origin}/api/**`, mockApi);
    page.on("response", (r) => {
      if (r.status() >= 400) console.log("RESPONSE", r.status(), r.url());
    });
    await page.clock.setFixedTime(new Date("2026-11-04T02:00:00Z"));
    await page.goto(`${origin}/programs/ai-salon/manage`);

    await page.getByRole("button", { name: "创建活动", exact: true }).click();

    await page.locator(".salon-schedule").scrollIntoViewIfNeeded();
    assert.equal(await page.locator(".salon-calendar").count(), 1);
    const sliders = () => page.getByRole("slider");
    const start = () =>
      page.getByRole("slider", { name: "活动开始时间", exact: true });
    const end = () =>
      page.getByRole("slider", { name: "活动结束时间", exact: true });
    const whole = () =>
      page.getByRole("slider", { name: "整体平移活动时段", exact: true });
    const checkTime = async (a, b) => {
      assert.equal(await start().getAttribute("aria-valuetext"), a);
      assert.equal(await end().getAttribute("aria-valuetext"), b);
    };
    await checkTime("14:00", "15:30");
    assert.equal(
      await page.locator('[data-date="2026-11-03"]').isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "下个月", exact: true }).click();
    await page.locator('[data-date="2026-12-15"]').click();
    await page.locator(".salon-date-target--deadline").click();
    await page.locator('[data-date="2026-11-30"]').click();
    assert.match(
      await page.locator(".salon-date-target--event").innerText(),
      /2026.12.15/,
    );
    assert.match(
      await page.locator(".salon-date-target--deadline").innerText(),
      /2026.11.30\n00:00/,
    );
    await page.locator(".salon-date-target--event").click();
    await page.getByRole("button", { name: "上个月", exact: true }).click();
    await page.locator('[data-date="2026-11-05"]').click();
    assert.match(
      await page.locator(".salon-date-target--deadline").innerText(),
      /2026.11.05\n00:00/,
    );
    assert.match(
      await page.locator(".salon-schedule-notice").innerText(),
      /同步/,
    );
    // Native keyboard arrows, Home/End, and cross-month calendar focus.
    await page.locator('[data-date="2026-11-30"]').focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.locator(":focus").getAttribute("data-date"),
      "2026-12-01",
    );
    await page.keyboard.press("Enter");
    await start().focus();
    await page.keyboard.press("ArrowRight");
    await checkTime("14:30", "15:30");
    await page.keyboard.press("End");
    await checkTime("15:00", "15:30");
    await end().focus();
    await page.keyboard.press("Home");
    await checkTime("15:00", "15:30");
    await whole().focus();
    await page.keyboard.press("End");
    await checkTime("23:30", "24:00");
    await page.keyboard.press("Home");
    await checkTime("00:00", "00:30");
    await page.getByRole("button", { name: "取消编辑", exact: true }).click();
    await page.getByRole("button", { name: "创建活动", exact: true }).click();
    const dragTo = async (control, minutes) => {
      await page.locator(".salon-timeline").scrollIntoViewIfNeeded();
      const b = await control.boundingBox(),
        t = await page.locator(".salon-timeline").boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        t.x + (t.width * minutes) / 1440,
        b.y + b.height / 2,
        { steps: 8 },
      );
      await page.mouse.up();
    };
    await dragTo(start(), 855);
    await checkTime("14:30", "15:30");
    await dragTo(end(), 1036);
    await checkTime("14:30", "17:30");
    const t = await page.locator(".salon-timeline").boundingBox();
    const r = await whole().boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + 22);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + (t.width * 90) / 1440, r.y + 22, {
      steps: 8,
    });
    await page.mouse.up();
    await checkTime("16:00", "19:00");
    await dragTo(start(), 1400);
    await checkTime("18:30", "19:00");
    assert.match(await whole().getAttribute("aria-valuetext"), /30 分钟/);
    await page.getByLabel("标题", { exact: true }).fill("测试活动");
    await page.locator("textarea").fill("测试简介");
    await page.getByLabel("地点", { exact: true }).fill("南岭");
    await page.getByRole("button", { name: "保存活动", exact: true }).click();
    await page.getByText("活动已保存", { exact: true }).waitFor();
    assert.equal(saved.at(-1).startAt, "2026-11-04T10:30:00.000Z");
    assert.equal(saved.at(-1).endAt, "2026-11-04T11:00:00.000Z");
    assert.equal(saved.at(-1).deadline, "2026-11-03T16:00:00.000Z");
    // Editing and saving unrelated fields must round-trip original seconds and legacy cutoff.
    for (const fixture of fixtures) {
      await page
        .locator("article")
        .filter({
          has: page.getByRole("heading", { name: fixture.title, exact: true }),
        })
        .getByRole("button", { name: "编辑", exact: true })
        .click();
      if (fixture.id === 71) {
        await checkTime("14:07:08", "15:09:10");
        assert.match(
          await page.locator(".salon-date-target--deadline").innerText(),
          /17:42:11.789/,
        );
      } else {
        assert.equal(await sliders().count(), 0);
        assert.match(
          await page.locator(".salon-legacy-time").innerText(),
          /23:45:12.123/,
        );
      }
      await page.locator("textarea").fill("修改简介");
      await page.getByRole("button", { name: "保存活动", exact: true }).click();
      await page.getByText("活动已保存", { exact: true }).waitFor();
      for (const key of ["startAt", "endAt", "deadline"])
        assert.equal(saved.at(-1)[key], fixture[key]);
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS desktop: defaults, past dates, cross-month selection, cutoff repair, keyboard, both pointer handles, whole-range drag, minimum duration, API UTC payload, historical exact round trip",
    );
    // Light/dark mobile layout and actual CDP touch pointer capture.
    const mobileContext = await browser.newContext({
      viewport: { width: 320, height: 740 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      timezoneId: "Pacific/Kiritimati",
    });
    const mobile = await mobileContext.newPage();
    await mobile.route(`${origin}/api/**`, mockApi);
    await mobile.clock.setFixedTime(new Date("2026-11-04T02:00:00Z"));
    await mobile.goto(`${origin}/programs/ai-salon/manage`);
    await mobile.getByRole("button", { name: "创建活动", exact: true }).click();
    await mobile.locator(".salon-time-picker").scrollIntoViewIfNeeded();
    for (const theme of ["light", "dark"]) {
      await mobile.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      assert.equal(
        await mobile.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
    const cdp = await mobileContext.newCDPSession(mobile);
    const touch = async (control, minutes) => {
      await mobile.locator(".salon-timeline").scrollIntoViewIfNeeded();
      const b = await control.boundingBox(),
        t = await mobile.locator(".salon-timeline").boundingBox();
      const y = b.y + b.height / 2;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: b.x + b.width / 2, y }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: t.x + (t.width * minutes) / 1440, y }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    };
    await touch(
      mobile.getByRole("slider", { name: "活动开始时间", exact: true }),
      870,
    );
    assert.equal(
      await mobile
        .getByRole("slider", { name: "活动开始时间", exact: true })
        .getAttribute("aria-valuetext"),
      "14:30",
    );
    await touch(
      mobile.getByRole("slider", { name: "活动结束时间", exact: true }),
      1020,
    );
    assert.equal(
      await mobile
        .getByRole("slider", { name: "活动结束时间", exact: true })
        .getAttribute("aria-valuetext"),
      "17:00",
    );
    const mr = await mobile
      .getByRole("slider", { name: "整体平移活动时段", exact: true })
      .boundingBox();
    const mt = await mobile.locator(".salon-timeline").boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: mr.x + mr.width / 2, y: mr.y + 22 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: mr.x + mr.width / 2 + (mt.width * 60) / 1440, y: mr.y + 22 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.equal(
      await mobile
        .getByRole("slider", { name: "活动开始时间", exact: true })
        .getAttribute("aria-valuetext"),
      "15:30",
    );
    assert.equal(
      await mobile
        .getByRole("slider", { name: "活动结束时间", exact: true })
        .getAttribute("aria-valuetext"),
      "18:00",
    );
    console.log(
      "PASS mobile: 320px light/dark no overflow, native touch both handles and whole range",
    );
    // A form left open across Beijing midnight disables yesterday immediately.
    const midnight = await context.newPage();
    await midnight.route(`${origin}/api/**`, mockApi);
    await midnight.clock.install({ time: new Date("2026-11-30T15:59:58Z") });
    await midnight.goto(`${origin}/programs/ai-salon/manage`);
    await midnight
      .getByRole("button", { name: "创建活动", exact: true })
      .click();
    await midnight.clock.fastForward(3100);
    assert.equal(
      await midnight.locator('[data-date="2026-11-30"]').isDisabled(),
      true,
    );
    console.log("PASS Beijing midnight rollover");
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
