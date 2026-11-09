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
// Verified from TARSBASE member records; other prefixes remain manual.
const collegeByPrefix: Record<string, string> = {
  "14": "机械与航空航天工程学院",
  "16": "材料科学与工程学院",
  "17": "交通学院",
  "19": "电子科学与工程学院",
  "20": "通信工程学院",
  "21": "计算机科学与技术学院",
  "24": "建设工程学院",
  "29": "人工智能学院",
  "35": "商学与管理学院",
};
export function inferCollege(id: string, year = new Date().getFullYear()): string {
  const value = id.trim();
  const admission = Number(`20${value.slice(2, 4)}`);
  if (!/^\d{8}$/.test(value) || value.slice(4, 6) === "00" || value.slice(6) === "00" || admission > year) return "";
  return collegeByPrefix[value.slice(0, 2)] ?? "";
}
export function updateAcademicStudentId(value: AcademicInput, studentId: string): AcademicInput {
  const previousSuggestion = inferCollege(value.studentId);
  const college = !value.college.trim() || (previousSuggestion !== "" && value.college === previousSuggestion)
    ? inferCollege(studentId) : value.college;
  return { ...value, studentId, college,
    grade: inferGrade(studentId) || (inferGrade(value.studentId) ? "" : value.grade) };
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