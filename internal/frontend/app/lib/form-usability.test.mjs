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
  assert.equal(registrationFieldError(field("phone"), "123"), "请输入有效的大陆手机号");
  assert.equal(registrationFieldError(field("phone"), "13812345678"), "");
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

test("collection form editor separates content, settings, preview and publish", async () => {
  const source = await readFile(new URL("../routes/admin/collection-forms.tsx", import.meta.url), "utf8");
  const publicForm = await readFile(new URL("../routes/collection-form.tsx", import.meta.url), "utf8");
  assert.match(source, /输入收集表标题/);
  assert.match(source, /常用字段/);
  assert.match(source, /添加问题/);
  assert.match(source, /view === "settings"/);
  assert.match(source, /view === "preview"/);
  assert.match(source, /onClick=\{\(\) => void save\(true\)\}/);
  assert.match(source, /CollectionFormFields fields=\{draft.fields\}/);
  assert.match(publicForm, /CollectionFormFields fields=\{form.fields\}/);
  assert.match(source, /collectionPresets\.map/);
  assert.match(source, /queueSave\(selected, draft\)/);
  assert.match(source, /view === "publish"/);
  assert.match(source, /useBlocker/);
  assert.match(source, /collectionClient\.delete\(id\)/);
  const templates = await readFile(new URL("./collection-form-presets.ts", import.meta.url), "utf8");
  assert.match(templates, /date\.setDate\(date\.getDate\(\) \+ 7\)/);
  assert.match(templates, /date\.setHours\(23, 59, 0, 0\)/);
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
