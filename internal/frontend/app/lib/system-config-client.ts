import { apiRequest } from "~/lib/api-client";

export interface EmailSystemConfig {
  from: string;
  configured: boolean;
}

export interface TestEmailSystemConfigInput { to: string; }
export interface TestVerificationCodeSystemConfigInput { to: string; }
export interface SendRegisterFlowCodeSystemConfigInput { email: string; }

export interface VerifyRegisterFlowCodeSystemConfigInput {
  email: string;
  code: string;
}

export async function getEmailSystemConfig(): Promise<EmailSystemConfig> {
  return apiRequest<EmailSystemConfig>("/api/admin/system-config/email");
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
