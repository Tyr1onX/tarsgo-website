import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AVATAR_FRAMES, isAvatarFrameUnlocked, resolveEquippedAvatarFrame } from "./avatar-frames.ts";

test("group frame access requires actual team membership, not an unknown group", () => {
  const outsider = { level: 2, groups: [{ name: "其他项目组" }] };
  assert.equal(isAvatarFrameUnlocked("group_ops", outsider), false);
  assert.equal(isAvatarFrameUnlocked("group_elec", outsider), false);
  const teammate = { ...outsider, groups: [{ name: "运营组" }] };
  assert.equal(isAvatarFrameUnlocked("group_ops", teammate), true);
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
  assert.equal(AVATAR_FRAMES.length, 14);
  assert.ok(AVATAR_FRAMES.every((frame) => frame.unlockHint.length > 0 && frame.unlockHint.length <= 30));
  assert.ok(AVATAR_FRAMES.filter((frame) => frame.track === "event").every((frame) => frame.unlockHint.includes("暂未开放")));
});
