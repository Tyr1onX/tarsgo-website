import { apiRequest } from "~/lib/api-client";
import type { EmailNotificationTemplates, EmailTemplateVariable } from "~/lib/email-templates";

export interface EmailManagementConfig {
  from: string;
  configured: boolean;
  notificationTemplates: EmailNotificationTemplates;
  availableVariables: EmailTemplateVariable[];
}

export async function getEmailManagementConfig(): Promise<EmailManagementConfig> {
  return apiRequest<EmailManagementConfig>("/api/admin/system-config/email");
}

export async function saveEmailNotificationTemplates(templates: EmailNotificationTemplates): Promise<EmailManagementConfig> {
  return apiRequest<EmailManagementConfig>("/api/admin/system-config/email/templates", {
    method: "PUT",
    body: { templates },
  });
}

export async function testEmailSystemConfig(input: { to: string }): Promise<void> {
  await apiRequest("/api/admin/system-config/email/test", {
    method: "POST",
    body: input,
  });
}
