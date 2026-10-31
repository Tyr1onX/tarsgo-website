import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../components/personal-timetable-upload.tsx", import.meta.url), "utf8");
const client = await readFile(new URL("./timetable-client.ts", import.meta.url), "utf8");

test("member timetable management is limited to the configured current semester", () => {
  assert.match(component, /尚未导入课表/);
  assert.match(component, /"已导入：" \+ records\[0\]\.semester/);
  assert.match(component, /importPersonalTimetable\(file\)/);
  assert.doesNotMatch(component, /aria-label="学期"|semesterSelect|setSemester|semesterOptions/);
  assert.doesNotMatch(client, /formData\.append\("semester"/);
  assert.match(component, /setRecords\(\[result\]\)/);
  assert.match(component, /setMessage\("课表已更新"\)/);
});

test("timetable picker uses accessible compact upload affordance without altering import semantics", () => {
  assert.match(component, /<FileUploadField[\s\S]*?label="教务系统课表 Excel"/);
  assert.match(component, /variant="compact"/);
  assert.match(component, /triggerLabel=\{file \? "重新选择" : "选择文件"\}/);
  assert.match(component, /onRetry=\{\(\) => void importSelected\(\)\}/);
  assert.match(component, /return "请选择 \.xlsx 格式的教务系统课表"/);
  assert.match(component, /MAX_TIMETABLE_BYTES = 5 \* 1024 \* 1024/);
  assert.match(component, /disabled=\{!file \|\| uploading\}/);
  assert.match(component, /setUploadStatus\("uploading"\)/);
  assert.match(component, /setFile\(null\)/);
});
