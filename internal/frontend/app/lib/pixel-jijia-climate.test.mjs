import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { changchunClimate, parseCurrentWeather, WEATHER_REFRESH_MS, advanceSurface, visualWind, nightLight, advanceWind } from "./pixel-jijia-climate.ts";

test("长春时钟不取访客本地时区，按照 UTC+8 确定季节", () => {
  const autumn = changchunClimate(new Date("2026-11-23T10:22:00.000Z"));
  assert.deepEqual([autumn.year, autumn.month, autumn.day, autumn.hour, autumn.minute],
    [2026, 11, 23, 18, 22]);
  assert.equal(autumn.season, "autumn");
  const winterEnd = changchunClimate(new Date("2026-02-28T15:59:00.000Z"));
  const springStart = changchunClimate(new Date("2026-02-28T16:00:00.000Z"));
  assert.equal(winterEnd.season, "winter");
  assert.equal(springStart.season, "spring");
  assert.equal(springStart.dateKey, "2026-03-01");
});

test("季节天气按四小时块确定，刷新不随机跳变，也不冒充观测温度", () => {
  for (const [month, season] of [[1, "winter"], [4, "spring"], [7, "summer"], [10, "autumn"]]) {
    const padded = String(month).padStart(2, "0");
    const a = changchunClimate(new Date(`2026-${padded}-14T03:01:00Z`));
    const b = changchunClimate(new Date(`2026-${padded}-14T03:55:00Z`));
    assert.equal(a.season, season);
    assert.equal(a.weather, b.weather);
    assert.equal(a.dateKey, b.dateKey);
    assert.equal(a.temperature, b.temperature);
    assert.ok(Number.isFinite(a.temperature));
    assert.ok(["clear", "cloudy", "rain", "snow","storm","fog"].includes(a.weather));
    assert.equal(a.weather === "snow" && a.temperature > 0, false);
    assert.equal(a.weather === "rain" && a.temperature <= 0, false);
  }
});

test("长春晚间降低光线但保持画面可辨认，夏季日照更长", () => {
  const noon = changchunClimate(new Date("2026-12-21T04:00:00Z"));
  const eveningWinter = changchunClimate(new Date("2026-12-21T13:00:00Z"));
  const eveningSummer = changchunClimate(new Date("2026-06-21T13:00:00Z"));
  assert.equal(noon.night, 0);
  assert.ok(eveningWinter.night > 0 && eveningWinter.night <= 0.42);
  assert.ok(eveningSummer.night > 0 && eveningSummer.night <= 0.42);
  assert.ok(eveningWinter.night >= eveningSummer.night);
});

test("四季地形、天气粒子与显示必须复用原 Canvas 及减少动态设置", () => {
  const scene = readFileSync(new URL("./pixel-jijia-scene.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../routes/pixel-jijia.tsx", import.meta.url), "utf8");
  assert.ok(scene.includes('season === "winter"'));
  assert.ok(scene.includes('season === "autumn"'));
  assert.ok(scene.includes('season === "spring"'));
  assert.ok(route.includes('window.setInterval(refresh, timeMode === "game" ? 1000 : 60_000)'));
  assert.ok(route.includes('time - lastWeather > (climate.weather === "snow" ? 150 : climate.weather === "storm" ? 38 : 65)'));
  assert.ok(route.includes("if (reducedMotion.matches || room)"));
  assert.ok(route.includes('aria-label="长春时间与天气"'));
});

test("WMO 实况天气和温度来自同一时间点，未知及过期数据拒绝使用", () => {
  const now = Date.UTC(2026, 10, 24, 1);
  const payload = code => ({current:{time: now / 1000, temperature_2m: -7.5, weather_code: code}});
  for (const [code, kind] of [[0,"clear"],[1,"clear"],[3,"cloudy"],[45,"fog"],[51,"rain"],[66,"rain"],[73,"snow"],[95,"storm"]]) {
    const result = parseCurrentWeather(payload(code), now);
    assert.equal(result.weather, kind);
    assert.equal(result.temperature, -7.5);
  }
  assert.equal(parseCurrentWeather(payload(999), now), null);
  assert.equal(parseCurrentWeather(payload(0), now + WEATHER_REFRESH_MS * 4), null);
  assert.equal(parseCurrentWeather({current:{time:now / 1000, temperature_2m:null,weather_code:0}}, now), null);
  assert.equal(parseCurrentWeather(null, now), null);
});

test("游戏时钟每秒推进一分钟且24分钟循环，太阳方向连续变化", () => {
  const t = Date.parse("2026-11-24T04:00:00Z");
  const a=changchunClimate(new Date(t),"game"), b=changchunClimate(new Date(t+1000),"game");
  assert.equal((b.hour*60+b.minute-a.hour*60-a.minute+1440)%1440,1);
  const cycle=changchunClimate(new Date(t+1440000),"game");
  assert.deepEqual([a.hour,a.minute],[cycle.hour,cycle.minute]);
  const morning=changchunClimate(new Date("2026-06-21T00:00:00Z")), afternoon=changchunClimate(new Date("2026-06-21T08:00:00Z"));
  assert.ok(morning.sunX>0&&afternoon.sunX<0);
  assert.ok(morning.sunHeight>0&&afternoon.sunHeight>0);
});

test("湿地与积雪随天气累积，雨停不瞬间消失，升温逐渐融化",()=>{
  const initial={wet:0,snow:0};
  const rain=advanceSurface(initial,"rain",12,5);
  assert.ok(rain.wet>.5&&rain.wet<1);
  assert.ok(advanceSurface(rain,"clear",12,1).wet>0);
  const snow=advanceSurface(initial,"snow",-5,8);
  assert.ok(snow.snow>.5);
  assert.equal(advanceSurface(snow,"clear",-5,20).snow,snow.snow);
  assert.ok(advanceSurface(snow,"clear",8,5).snow<snow.snow);
  assert.equal(advanceSurface(rain,null,null,1),rain);
});


test("视觉风随天气变化且连续，灯光阈值错开并平滑",()=>{
  for(let t=0;t<120000;t+=173){
    assert.ok(Math.abs(visualWind("storm",t))>=Math.abs(visualWind("clear",t)));
    assert.ok(Math.abs(visualWind("storm",t+16)-visualWind("storm",t))<.2);
    assert.ok(Math.abs(visualWind("snow",t))<=9);
  }
  assert.equal(nightLight(0,0),0);
  assert.ok(nightLight(.12,0)>nightLight(.12,.9));
  assert.equal(nightLight(.42,0),nightLight(.42,1));
  for(let n=.01;n<=.42;n+=.01)assert.ok(nightLight(n,.5)>=nightLight(n-.01,.5));
});


test("天气切换不瞬间改变视觉风场",()=>{
  const t=1000,before=visualWind("clear",t),after=advanceWind(before,"storm",t+16,.016);
  assert.ok(Math.abs(after-before)<.6);
  assert.ok(Math.abs(after-visualWind("storm",t+16))<Math.abs(before-visualWind("storm",t+16)));
  assert.equal(advanceWind(before,"storm",t,0),before);
});
