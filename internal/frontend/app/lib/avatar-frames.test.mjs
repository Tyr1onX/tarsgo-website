import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AVATAR_FRAMES, isAvatarFrameUnlocked, resolveEquippedAvatarFrame } from "./avatar-frames.ts";

test("group-specific frames are retired and saved choices fall back to remaining frames", () => {
  const retired = ["group_mech", "group_elec", "group_vision", "group_ai", "group_ops"];
  assert.equal(AVATAR_FRAMES.length, 9);
  assert.ok(AVATAR_FRAMES.every((frame) => frame.track !== "group"));
  for (const key of retired) {
    assert.equal(AVATAR_FRAMES.some((frame) => frame.id === key), false);
    assert.equal(isAvatarFrameUnlocked(key, { level: 6, groups: [{ name: "电控组" }] }), false);
    assert.equal(resolveEquippedAvatarFrame({ level: 2, avatarFrameKey: key }), "calibration");
  }
});

test("server profile choice is the sole source of equipped avatar frame", () => {
  const member = { userId: 12, level: 4, avatarFrameKey: "reactor" };
  assert.equal(resolveEquippedAvatarFrame(member), "reactor");
  assert.equal(resolveEquippedAvatarFrame({ ...member, avatarFrameKey: "none" }), null);
  assert.equal(resolveEquippedAvatarFrame({ ...member, avatarFrameKey: "titan" }), "titan");
  assert.equal(resolveEquippedAvatarFrame({ ...member, avatarFrameKey: "unknown-frame" }), "reactor");
  assert.equal(isAvatarFrameUnlocked("overclock", { ...member, hasSevenDayStreak: false }), false);
  assert.equal(isAvatarFrameUnlocked("overclock", { ...member, hasSevenDayStreak: true }), true);
});

test("avatar gallery persists through profile API and never saves an unverified browser-only choice", async () => {
  const code = await readFile(new URL("../components/avatar-frame.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../routes/dashboard/community-member-profile.tsx", import.meta.url), "utf8");
  const service = await readFile(new URL("./avatar-frames.ts", import.meta.url), "utf8");
  assert.match(route, /updateMine\(\{ avatarFrameKey: choice \}\)/);
  assert.match(code, /onChoose\?: \(choice: AvatarFrameChoice\) => void/);
  assert.doesNotMatch(service, /localStorage|sessionStorage|writeAvatarFramePreference|readAvatarFramePreference/);
});

test("own profile has one visible avatar frame entry beside the name, not buried in badges", async () => {
  const route = await readFile(new URL("../routes/dashboard/community-member-profile.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../routes/dashboard/community.css", import.meta.url), "utf8");
  assert.match(route, /<TeamIdentityBadge[^>]+\/>\s*\{isSelf \? <button[\s\S]*?更换头像框/);
  assert.match(route, /aria-expanded=\{framePickerOpen\}/);
  assert.match(route, /\{isSelf && framePickerOpen \? <div id="community-member-frame-picker"/);
  assert.equal((route.match(/<AvatarFrameGallery /g) ?? []).length, 1);
  const badgesSection = route.slice(route.indexOf('{tab === "badges" ? <section', route.indexOf("export default function")));
  assert.ok(!badgesSection.slice(0, badgesSection.indexOf('{tab === "settings"')).includes("AvatarFrameGallery"));
  assert.match(styles, /\.community-member-hero__frame-toggle/);
});

test("frame gallery shows only acquisition conditions and preserves locked status", async () => {
  const source = await readFile(new URL("../components/avatar-frame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../components/avatar-frame.css", import.meta.url), "utf8");
  assert.match(source, /\{frame\.unlockHint\}/);
  assert.match(source, /disabled=\{!unlocked/);
  assert.doesNotMatch(source, /frame\.description/);
  assert.doesNotMatch(css, /avatar-frame-card__desc/);
  assert.equal(AVATAR_FRAMES.length, 9);
  assert.ok(AVATAR_FRAMES.every((frame) => frame.unlockHint.length > 0 && frame.unlockHint.length <= 30));
  assert.ok(AVATAR_FRAMES.filter((frame) => frame.track === "event").every((frame) => frame.unlockHint.includes("暂未开放")));
});

test("frame previews temporarily change only the own-profile hero without saving", async () => {
  const route = await readFile(new URL("../routes/dashboard/community-member-profile.tsx", import.meta.url), "utf8");
  const gallery = await readFile(new URL("../components/avatar-frame.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../components/avatar-frame.css", import.meta.url), "utf8");
  assert.match(route, /const \[previewFrameId, setPreviewFrameId\] = useState<AvatarFrameId \| null>\(null\)/);
  assert.match(route, /forcedFrameId=\{previewFrameId \?\? undefined\}/);
  assert.match(route, /onPreview=\{setPreviewFrameId\}/);
  assert.match(route, /预览中 · 未保存/);
  assert.match(gallery, /onPreview\?: \(frameId: AvatarFrameId \| null\) => void/);
  assert.match(gallery, /onClick=\{\(\) => onPreview\?\.\(isPreviewed \? null : frame\.id\)\}/);
  assert.match(gallery, /aria-pressed=\{isPreviewed\}/);
  assert.match(gallery, /disabled=\{!unlocked \|\| saving\}/);
  assert.match(styles, /\.avatar-frame-card__action--preview\.is-previewing/);
  assert.doesNotMatch(gallery, /onPreview\?\.\([^\n]*updateMine/);
});

test("retired group artwork and picker tab are gone while preview remains", async () => {
  const component = await readFile(new URL("../components/avatar-frame.tsx", import.meta.url), "utf8");
  const profile = await readFile(new URL("../routes/dashboard/community-member-profile.tsx", import.meta.url), "utf8");
  for (const id of ["group_mech", "group_elec", "group_vision", "group_ai", "group_ops"]) {
    assert.equal(component.includes(id), false);
  }
  assert.equal(component.includes("轨道 C · 组别"), false);
  assert.ok(component.includes("onPreview?: (frameId: AvatarFrameId | null) => void"));
  assert.ok(component.includes("onPreview?.(isPreviewed ? null : frame.id)"));
  assert.equal(profile.includes("groups: member.groups,"), false);
});


test("precision CNC frames keep 200-unit artwork and engraved season-year plates", async () => {
  const graphics = await readFile(new URL("../components/avatar-frame.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../components/avatar-frame.css", import.meta.url), "utf8");
  assert.match(graphics, /function RadialTicks\(/);
  assert.match(graphics, /function MicroRivet\(/);
  assert.match(graphics, /function PrecisionInnerBezel\(/);
  assert.match(graphics, /viewBox="0 0 200 200"/);
  assert.doesNotMatch(graphics, /viewBox="0 0 160 160"/);
  assert.match(graphics, /seasonYear = 2026/);
  assert.match(graphics, /RMUL \{seasonYear\}/);
  assert.match(graphics, /RMUC \{seasonYear\}/);
  assert.match(css, /inset: -25%/);
  assert.match(css, /width: 150%/);
  assert.match(css, /transform-origin: 100px 100px/);
  assert.deepEqual(
    AVATAR_FRAMES.filter((frame) => frame.track === "event").map((frame) => frame.tierLabel),
    ["赛事限定 · 2026 联盟赛", "赛事限定 · 2026 区域赛", "赛事限定 · 2026 全国赛"],
  );
});
