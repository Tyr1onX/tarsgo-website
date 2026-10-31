import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mergeFileUploadSelection } from "./file-upload-selection.ts";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const field = await source("../components/file-upload-field.tsx");
const styles = await source("../app.css");

test("multiple selection appends files and allows selecting the same file again", () => {
  const first = { name: "report.pdf" };
  const second = { name: "photo.png" };
  assert.deepEqual(mergeFileUploadSelection([first], [second], true), { files: [first, second], error: null });
  assert.deepEqual(mergeFileUploadSelection([first], [first], true), { files: [first, first], error: null });
});

test("single selection replaces the current file and rejects multiple incoming files", () => {
  const first = { name: "old.xlsx" };
  const second = { name: "new.xlsx" };
  assert.deepEqual(mergeFileUploadSelection([first], [second], false), { files: [second], error: null });
  assert.deepEqual(mergeFileUploadSelection([first], [first, second], false), {
    files: [first],
    error: "一次只能选择一个文件。",
  });
});

test("shared field keeps accessible selection, drag/drop, thumbnails, status, progress, retry, and removal", () => {
  assert.match(field, /role="group"/);
  assert.match(field, /aria-label=\{label\}/);
  assert.match(field, /onDrop=\{variant === "dropzone" \? handleDrop : undefined\}/);
  assert.match(field, /URL\.createObjectURL/);
  assert.match(field, /statusLabels\[status\]/);
  assert.match(field, /<progress max=\{100\} value=\{progress\}/);
  assert.match(field, /onClick=\{retryUpload\}/);
  assert.match(field, /移除/);
  assert.match(field, /event\.currentTarget\.value = ""/);
  assert.match(styles, /@media \(max-width: 639px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?file-upload-field/);
});

test("all native upload entry points use the shared field except the existing avatar interaction", async () => {
  const paths = [
    "../routes/dashboard/weekly-reports.tsx",
    "../routes/dashboard/assignments.tsx",
    "../routes/admin/assignment-management.tsx",
    "../routes/dashboard/practice-projects.tsx",
    "../components/community-composer.tsx",
    "../routes/dashboard/community-post.tsx",
    "../routes/users/registrations.tsx",
    "../components/personal-timetable-upload.tsx",
    "../routes/admin/admission-qr-settings.tsx",
    "../routes/leave-workbench.tsx",
  ];
  for (const path of paths) assert.match(await source(path), /FileUploadField/);

  const layout = await source("../routes/dashboard/layout.tsx");
  assert.match(layout, /import \{ ProfileDialog \} from "~\/components\/profile-dialog"/);
  const avatar = await source("../components/profile-dialog.tsx");
  assert.match(avatar, /type="file"/);
  assert.match(avatar, /头像/);
});
