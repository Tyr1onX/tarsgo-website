package model

import (
	"fmt"
	"time"
)

const accountActivityWindowDays = 90

// Production login confirmation baseline, shared by account management and
// workbench access. Database and application timestamps use Asia/Shanghai.
var AccountActivityConfirmationStartedAt = time.Date(2026, time.October, 19, 11, 19, 8, 0, time.FixedZone("Asia/Shanghai", 8*60*60))

func AccountActivityCutoff(now time.Time) time.Time {
	cutoff := now.Add(-accountActivityWindowDays * 24 * time.Hour)
	if AccountActivityConfirmationStartedAt.After(cutoff) {
		return AccountActivityConfirmationStartedAt
	}
	return cutoff
}

// Calculated for every session read, never stored separately. A default group
// is not a team assignment; administrative roles do not bypass this rule.
var WorkbenchAccessSQL = fmt.Sprintf(`(users.status = 1
 AND users.last_login_at >= GREATEST(DATE_SUB(NOW(), INTERVAL %d DAY), '%s')
 AND EXISTS (
   SELECT 1 FROM user_group_members AS member
   JOIN user_groups AS team ON team.id = member.group_id
   WHERE member.user_id = users.id AND team.status = 1 AND team.is_default = 0
 )) AS workbench_access`, accountActivityWindowDays, AccountActivityConfirmationStartedAt.Format("2006-01-02 15:04:05"))
