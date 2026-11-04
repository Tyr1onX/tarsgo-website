import { apiRequest } from "./api-client.ts";

export interface AcademicInput {
  isStudent: boolean | null;
  studentId: string;
  college: string;
  grade: string;
}
export interface AccountProfile extends AcademicInput { realName: string; email: string }
export const emptyAcademicInput: AcademicInput = { isStudent: null, studentId: "", college: "", grade: "" };
export const getAccountProfile = () => apiRequest<AccountProfile>("/api/me/profile");

// Confirmed JLU eight-digit college/year/class/sequence family only.
export function inferGrade(id: string, year = new Date().getFullYear()): string {
  const value = id.trim();
  if (!/^(20|35)\d{6}$/.test(value) || value.slice(4, 6) === "00" || value.slice(6) === "00") return "";
  const admission = Number(`20${value.slice(2, 4)}`);
  return admission >= 2000 && admission <= year ? `${admission} 级` : "";
}
export function profileComplete(p: AccountProfile): boolean {
  return Boolean(p.realName.trim() && p.email && typeof p.isStudent === "boolean" &&
    (!p.isStudent || (p.studentId.trim() && p.college.trim() && p.grade.trim())));
}
export function accountProfilePath(userId: number, returnTo?: string): string {
  return `/dashboard/members/${userId}?tab=settings${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`;
}
export function salonReturnPath(value: string | null): string | null {
  return value && /^\/programs\/ai-salon\/\d+$/.test(value) ? value : null;
}
