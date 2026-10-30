import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../components/personal-timetable-upload.tsx", import.meta.url), "utf8");
const client = await readFile(new URL("./timetable-client.ts", import.meta.url), "utf8");

test("member timetable management is limited to the configured current semester", () => {
  assert.match(component, /尚未导入课表/);
  assert.match(component, /已导入：\$\{records\[0\]\.semester\}/);
  assert.match(component, /importPersonalTimetable\(file\)/);
  assert.doesNotMatch(component, /aria-label="学期"|semesterSelect|setSemester|semesterOptions/);
  assert.doesNotMatch(client, /formData\.append\("semester"/);
  assert.match(component, /setRecords\(\[result\]\)/);
  assert.match(component, /setMessage\("课表已更新"\)/);
});
