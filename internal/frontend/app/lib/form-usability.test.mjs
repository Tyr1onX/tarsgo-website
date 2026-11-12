import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { registrationFieldError } from "./registration-form-schema.ts";

const field = (type, required = true) => ({ key: "sample", label: "示例字段", type, required });

test("recruitment validation reports missing required text, selections and uploads", () => {
  assert.equal(registrationFieldError(field("text"), "   "), "此项为必填项");
  assert.equal(registrationFieldError(field("checkbox"), []), "请至少选择一项");
  assert.equal(registrationFieldError(field("file"), null), "请上传文件");
  assert.equal(registrationFieldError(field("file"), null, [{ fileName: "stored.pdf" }]), "");
  assert.equal(registrationFieldError(field("image"), [{ name: "new.png" }]), "");
  assert.equal(registrationFieldError(field("text", false), ""), "");
});

test("recruitment validation checks optional values only when supplied", () => {
  assert.equal(registrationFieldError(field("email"), "wrong-email"), "请输入有效的邮箱地址");
  assert.equal(registrationFieldError(field("email"), "student@example.com"), "");
  assert.equal(registrationFieldError(field("number", false), "invalid"), "请输入有效数字");
  assert.equal(registrationFieldError(field("number", false), "0"), "");
});

test("form keeps inline errors, compact radios and registered attachment limits", async () => {
  const source = await readFile(new URL("../routes/users/registrations.tsx", import.meta.url), "utf8");
  assert.match(source, /registrationFieldError\(/);
  assert.match(source, /onFieldBlur=\{validateFieldOnBlur\}/);
  assert.match(source, /role="radiogroup"/);
  assert.match(source, /allowedTypes\.join\("、"\)/);
  assert.match(source, /aria-invalid=\{Boolean\(error\)\}/);
});

test("authentication passwords share an accessible visibility control", async () => {
  const password = await readFile(new URL("../components/password-field.tsx", import.meta.url), "utf8");
  const register = await readFile(new URL("../routes/register.tsx", import.meta.url), "utf8");
  const login = await readFile(new URL("../routes/login.tsx", import.meta.url), "utf8");
  assert.match(password, /aria-pressed=\{visible\}/);
  assert.match(password, /type=\{visible \? "text" : "password"\}/);
  assert.match(register, /<PasswordField id="password"/);
  assert.match(login, /<PasswordField id="reset-password-confirm"/);
});
