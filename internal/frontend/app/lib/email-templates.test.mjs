import assert from "node:assert/strict";
import test from "node:test";

import { previewEmailTemplate, validateEmailNotificationTemplates } from "./email-templates.ts";

const variables = [
  { name: "name", token: "{{name}}", label: "姓名", example: "张三" },
  { name: "project", token: "{{project}}", label: "报名项目", example: "2026 招新报名" },
  { name: "group", token: "{{group}}", label: "组别", example: "机械组" },
  { name: "date", token: "{{date}}", label: "日期", example: "2026年10月13日" },
];

function validTemplates() {
  return {
    screeningRejected: { subject: "初筛 {{name}}", body: "报名项目：{{project}}" },
    interviewAdmitted: { subject: "录取 {{name}}", body: "组别：{{group}} {{date}}" },
    interviewRejected: { subject: "未通过 {{name}}", body: "报名项目：{{project}}" },
  };
}

test("email preview replaces only the advertised variables", () => {
  assert.equal(previewEmailTemplate("{{name}} · {{group}}", variables), "张三 · 机械组");
});

test("email template validation rejects unknown and malformed variables", () => {
  const unknown = validTemplates();
  unknown.screeningRejected.body += " {{recipient}}";
  assert.match(validateEmailNotificationTemplates(unknown, variables), /不支持的变量/);

  const malformed = validTemplates();
  malformed.interviewAdmitted.body = "{{name";
  assert.match(validateEmailNotificationTemplates(malformed, variables), /不支持的变量/);
});

test("email template validation accepts the four predefined variables", () => {
  assert.equal(validateEmailNotificationTemplates(validTemplates(), variables), "");
});
