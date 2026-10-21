export const assignmentMaterialAccept = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.txt,.md,.zip,.7z,.rar";
export const maxAssignmentMaterialFiles = 10;
export const maxAssignmentMaterialFileSize = 20 * 1024 * 1024;
export const maxAssignmentMaterialFilesTotal = 50 * 1024 * 1024;

type SizedFile = { size: number };

export function validateAssignmentMaterialSelection(
  existing: SizedFile[],
  pending: SizedFile[],
  incoming: SizedFile[],
) {
  const selected = [...pending, ...incoming];
  if (existing.length + selected.length > maxAssignmentMaterialFiles) return "教学资料最多 10 个文件。";
  if (selected.some((file) => file.size <= 0 || file.size > maxAssignmentMaterialFileSize)) return "单个教学资料不能为空且不能超过 20 MB。";
  const total = [...existing, ...selected].reduce((sum, file) => sum + file.size, 0);
  if (total > maxAssignmentMaterialFilesTotal) return "教学资料总大小不能超过 50 MB。";
  return "";
}

export function formatAssignmentMaterialSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(size / 1024))} KB`;
}
