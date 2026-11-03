package database

import (
	"fmt"
	"gorm.io/gorm"
	"regexp"
)

// Fixed DDL keeps historical AutoMigrate calls from applying this constraint
// before their data migrations. Never resolve a duplicate by deleting history.
func migrateWeeklyUniqueV46(db *gorm.DB) error {
	return migrateWeeklyUniqueV46Table(db, "weekly_reports")
}

func migrateWeeklyUniqueV46Table(db *gorm.DB, table string) error {
	if !regexp.MustCompile(`^[a-z0-9_]+$`).MatchString(table) {
		return fmt.Errorf("invalid weekly report table")
	}
	quoted := "`" + table + "`"
	var columns []struct {
		ColumnName string
		NonUnique  int
	}
	if err := db.Raw(`SELECT COLUMN_NAME, NON_UNIQUE FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name='uk_weekly_report_user_week' ORDER BY seq_in_index`, table).Scan(&columns).Error; err != nil {
		return err
	}
	if len(columns) > 0 {
		if len(columns) != 2 || columns[0].ColumnName != "user_id" || columns[1].ColumnName != "week_start" || columns[0].NonUnique != 0 || columns[1].NonUnique != 0 {
			return fmt.Errorf("weekly unique index definition differs; manual review required")
		}
		return nil
	}
	var duplicates int64
	if err := db.Raw("SELECT COUNT(*) FROM (SELECT user_id, week_start FROM " + quoted + " GROUP BY user_id, week_start HAVING COUNT(*)>1) duplicates").Scan(&duplicates).Error; err != nil {
		return err
	}
	if duplicates > 0 {
		return fmt.Errorf("weekly report migration blocked: %d duplicate user-weeks; preserve and reconcile history before retry", duplicates)
	}
	// ALTER atomically validates the constraint, including writes after preflight.
	// Existing indexes remain so rollback needs no historical reconstruction.
	return db.Exec("ALTER TABLE " + quoted + " ADD UNIQUE INDEX uk_weekly_report_user_week (user_id, week_start)").Error
}
