package model

// WorkbenchLegacyCreatedBefore is a temporary, fixed DATETIME(0) wall-clock
// boundary: 2026-11-03 18:10:00 Asia/Shanghai (10:10:00 UTC). Production read-only
// audit at 18:09:52 found 821 users, latest created_at 2026-10-31 09:58:21.
// The owner confirmed no new registrations before release. Both production
// application and database store Asia/Shanghai wall time. Comparing in SQL
// avoids driver timezone reinterpretation. Never change this to NOW().
const WorkbenchLegacyCreatedBefore = "2026-11-03 18:10:00"

// Derived on every session query; never persisted or cached separately. After
// roster reconciliation remove the final OR and the constant above.
const WorkbenchAccessSQL = `(users.team_identity_status IN ('trainee_member', 'formal_member')
 OR EXISTS (SELECT 1 FROM roles WHERE roles.id = users.role_id AND roles.name IN ('admin', 'super_admin'))
 OR users.created_at < '` + WorkbenchLegacyCreatedBefore + `') AS workbench_access`
