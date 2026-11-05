import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("operation success notifications dismiss automatically while errors remain until dismissed", () => {
  const notify = source("components/notify.tsx");
  assert.match(notify, /if \(!open \|\| tone !== "success"\) return/);
  assert.match(notify, /window\.setTimeout\(\(\) => onCloseRef\.current\(\), 2800\)/);
  assert.match(notify, /return \(\) => window\.clearTimeout\(timer\)/);
  assert.match(notify, /role=\{tone === "error" \? "alert" : "status"\}/);
});

test("successful admin and workbench operations use the same non-layout notification", () => {
  for (const path of [
    "routes/admin/users.tsx",
    "routes/admin/registrations.tsx",
    "routes/admin/admission-qr-settings.tsx",
    "routes/admin/assignment-management.tsx",
    "routes/admin/assignment-submissions.tsx",
    "routes/admin/interview-sessions.tsx",
    "routes/admin/timetable-availability.tsx",
    "routes/dashboard/practice-projects.tsx",
    "routes/dashboard/weekly-reports.tsx",
    "routes/dashboard/community-member-profile.tsx",
    "routes/leave-workbench.tsx",
    "components/personal-profile-settings.tsx",
    "components/personal-timetable-upload.tsx",
    "routes/ai-salon-detail.tsx",
    "routes/ai-salon-manage.tsx",
    "components/salon-schedule-picker.tsx",
  ]) {
    assert.match(source(path), /<Notify tone="success" message=\{/ , path);
  }
});

test("errors still appear in place and unrelated business states remain visible", () => {
  for (const path of [
    "routes/admin/users.tsx",
    "routes/admin/registrations.tsx",
    "routes/admin/admission-qr-settings.tsx",
    "routes/admin/assignment-management.tsx",
  ]) {
    assert.match(source(path), /admin-notice--error/, path);
  }
  assert.match(source("routes/dashboard/weekly-reports.tsx"), /weekly-report__inline-error/);
  assert.match(source("routes/login.tsx"), /\{notice \? <p role="status"/);
  assert.match(source("routes/public-leave-camp.tsx"), /\{done \? <p role="status"/);
  assert.doesNotMatch(source("routes/dashboard/weekly-reports.tsx"), /weekly-report__inline-success/);
  assert.doesNotMatch(source("components/community-growth.tsx"), /community-growth__notice/);
});
