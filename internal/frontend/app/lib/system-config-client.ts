import { apiRequest } from "~/lib/api-client";

export interface EmailSystemConfig {
  host: string;
  port: string;
  username: string;
  from: string;
  passwordMasked: string;
  passwordConfigured: boolean;
  requiresRestart: boolean;
}

export interface UpdateEmailSystemConfigInput {
  host: string;
  port: string;
  username: string;
  password: string;
  from: string;
}

export interface TestEmailSystemConfigInput extends UpdateEmailSystemConfigInput {
  to: string;
}

export interface TestVerificationCodeSystemConfigInput extends UpdateEmailSystemConfigInput {
  to: string;
}

export interface SendRegisterFlowCodeSystemConfigInput extends UpdateEmailSystemConfigInput {
  email: string;
}

export interface VerifyRegisterFlowCodeSystemConfigInput {
  email: string;
  code: string;
}

export interface OAuthSystemConfigItem {
  provider: string;
  displayName: string;
  enabled: boolean;
  clientId: string;
  callbackUrl: string;
  scope: string;
  clientSecretMasked: string;
  clientSecretConfigured: boolean;
  requiresRestart: boolean;
}

export interface UpdateOAuthSystemConfigInput {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  scope: string;
}

export async function getEmailSystemConfig(): Promise<EmailSystemConfig> {
  return apiRequest<EmailSystemConfig>("/api/admin/system-config/email");
}

export async function updateEmailSystemConfig(
  input: UpdateEmailSystemConfigInput,
): Promise<EmailSystemConfig> {
  return apiRequest<EmailSystemConfig>("/api/admin/system-config/email", {
    method: "PUT",
    body: input,
  });
}

export async function testEmailSystemConfig(input: TestEmailSystemConfigInput): Promise<void> {
  await apiRequest("/api/admin/system-config/email/test", {
    method: "POST",
    body: input,
  });
}

export async function testVerificationCodeSystemConfig(
  input: TestVerificationCodeSystemConfigInput,
): Promise<void> {
  await apiRequest("/api/admin/system-config/email/test-code", {
    method: "POST",
    body: input,
  });
}

export async function sendRegisterFlowCodeSystemConfig(
  input: SendRegisterFlowCodeSystemConfigInput,
): Promise<void> {
  await apiRequest("/api/admin/system-config/email/register-flow/send-code", {
    method: "POST",
    body: input,
  });
}

export async function verifyRegisterFlowCodeSystemConfig(
  input: VerifyRegisterFlowCodeSystemConfigInput,
): Promise<void> {
  await apiRequest("/api/admin/system-config/email/register-flow/verify-code", {
    method: "POST",
    body: input,
  });
}

export async function getOAuthSystemConfig(): Promise<OAuthSystemConfigItem[]> {
  const data = await apiRequest<{ items: OAuthSystemConfigItem[] }>("/api/admin/system-config/oauth");
  return data.items;
}

export async function updateOAuthSystemConfig(
  provider: string,
  input: UpdateOAuthSystemConfigInput,
): Promise<OAuthSystemConfigItem> {
  return apiRequest<OAuthSystemConfigItem>(`/api/admin/system-config/oauth/${encodeURIComponent(provider)}`, {
    method: "PUT",
    body: input,
  });
}
