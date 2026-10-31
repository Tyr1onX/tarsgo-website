export function mergeFileUploadSelection<T>(current: T[], incoming: T[], multiple: boolean) {
  if (incoming.length === 0) return { files: current, error: null };
  if (!multiple && incoming.length > 1) return { files: current, error: "一次只能选择一个文件。" };
  return { files: multiple ? [...current, ...incoming] : [incoming[incoming.length - 1]], error: null };
}
