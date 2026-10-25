import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const usersRoute = await readFile(new URL("../routes/admin/users.tsx", import.meta.url), "utf8");
const usersClient = await readFile(new URL("./admin-users-client.ts", import.meta.url), "utf8");

test("account management defaults to active accounts and exposes an all-accounts toggle", () => {
  assert.match(usersRoute, /useState\(false\).*includeInactive/s);
  assert.match(usersRoute, /includeInactive,\s*\}\);/);
  assert.match(usersRoute, /高级筛选[\s\S]*?包含停用或超过 90 天未登录的账号/);
  assert.match(usersClient, /if \(input\.includeInactive\)[\s\S]*?params\.set\("includeInactive", "true"\)/);
});
