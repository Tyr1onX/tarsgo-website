import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isAvatarFrameUnlocked, resolveEquippedAvatarFrame } from "./avatar-frames.ts";

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
