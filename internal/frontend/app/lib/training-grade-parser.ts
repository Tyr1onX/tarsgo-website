export interface TrainingGradeInput {
  name: string;
  score: number | null;
  note: string;
}

export function parseTrainingGradeText(text: string) {
  const rows: TrainingGradeInput[] = [];
  const errors: string[] = [];
  const names = new Set<string>();

  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim().replace(/^\d+[.、．]\s*/, "");
    if (!line) continue;
    const match = line.match(/^(\S+)(?:\s+(.*))?$/);
    if (!match) { errors.push(`第 ${index + 1} 行无法识别`); continue; }
    const name = match[1];
    const value = match[2]?.trim() ?? "";
    if (names.has(name)) { errors.push(`第 ${index + 1} 行姓名重复：${name}`); continue; }
    names.add(name);
    if (/^\d+$/.test(value)) {
      const score = Number(value);
      if (score > 100) { errors.push(`第 ${index + 1} 行成绩超出 0–100`); continue; }
      rows.push({ name, score, note: "" });
    } else {
      rows.push({ name, score: null, note: value });
    }
  }

  return { rows, errors };
}
