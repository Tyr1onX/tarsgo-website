import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("password reset stays in the login flow and uses account-neutral email feedback", async () => {
  const login = await source("../routes/login.tsx");
  const client = await source("./auth-client.ts");
  const handler = await source("../../../backend/handler/auth.go");
  const router = await source("../../../backend/router/router.go");

  assert.match(login, /忘记密码？/);
  assert.match(login, /通过邮箱重置密码/);
  assert.match(login, /如果该邮箱已注册且可用，验证码将发送至该邮箱，请查收/);
  assert.match(login, /两次输入的密码不一致/);
  assert.match(login, /密码已重置，请使用新密码登录/);
  assert.match(login, /loginCodeCooldown = useCooldown()/);
  assert.match(login, /passwordResetCooldown = useCooldown()/);
  assert.match(client, /apiRequest\("\/api\/password-reset\/send-code", \{ method: "POST", body: \{ email \} \}\)/);
  assert.match(client, /apiRequest\("\/api\/password-reset", \{ method: "POST", body: input \}\)/);
  assert.match(handler, /如该邮箱已注册且可用，验证码将发送至该邮箱/);
  assert.match(router, /api\.POST\("\/password-reset\/send-code", requireSameOriginRequest/);
  assert.match(router, /api\.POST\("\/password-reset", requireSameOriginRequest/);
  assert.doesNotMatch(login, /console\.(log|debug|info)\(/);
});
