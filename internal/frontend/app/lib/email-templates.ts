export type EmailNotificationTemplate = { subject: string; body: string };

export type EmailNotificationTemplates = {
  screeningRejected: EmailNotificationTemplate;
  interviewAdmitted: EmailNotificationTemplate;
  interviewRejected: EmailNotificationTemplate;
};

export type EmailTemplateVariable = {
  name: string;
  token: string;
  label: string;
  example: string;
};

const TEMPLATE_LABELS: Record<keyof EmailNotificationTemplates, string> = {
  screeningRejected: "初筛未通过",
  interviewAdmitted: "面试录取",
  interviewRejected: "面试未通过",
};

export function previewEmailTemplate(value: string, variables: EmailTemplateVariable[]) {
  return variables.reduce((preview, variable) => preview.replaceAll(variable.token, variable.example), value);
}

export function validateEmailNotificationTemplates(
  templates: EmailNotificationTemplates,
  variables: EmailTemplateVariable[],
) {
  const allowed = new Set(variables.map((variable) => variable.token));
  for (const key of Object.keys(TEMPLATE_LABELS) as (keyof EmailNotificationTemplates)[]) {
    const template = templates[key];
    const label = TEMPLATE_LABELS[key];
    if (!template.subject.trim() || template.subject.length > 255 || /[\r\n]/.test(template.subject)) {
      return `${label}邮件主题不能为空、不能换行且不能超过 255 个字。`;
    }
    if (!template.body.trim() || template.body.length > 10000) {
      return `${label}邮件正文不能为空且不能超过 10000 个字。`;
    }
    for (const value of [template.subject, template.body]) {
      const placeholders = value.match(/\{\{[^{}]*\}\}/g) ?? [];
      if (placeholders.some((placeholder) => !allowed.has(placeholder)) || /\{\{|\}\}/.test(value.replace(/\{\{[^{}]*\}\}/g, ""))) {
        return `${label}邮件包含不支持的变量。`;
      }
    }
  }
  return "";
}
