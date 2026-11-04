export const assignmentMaterialAccept = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.txt,.md,.zip,.7z,.rar";
export const maxAssignmentMaterialFiles = 10;

type SizedFile = { size: number };

export function validateAssignmentMaterialSelection(
  existing: SizedFile[],
  pending: SizedFile[],
  incoming: SizedFile[],
) {
  const selected = [...pending, ...incoming];
  if (existing.length + selected.length > maxAssignmentMaterialFiles) return "教学资料最多 10 个文件。";
  if (selected.some((file) => file.size <= 0)) return "不能上传空教学资料。";
  return "";
}

export function formatAssignmentMaterialSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(size / 1024))} KB`;
}
