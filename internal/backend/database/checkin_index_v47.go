package database

import (
	"fmt"
	"regexp"

	"gorm.io/gorm"
)

func migrateCheckinIndexV47(db *gorm.DB) error {
	return migrateCheckinIndexV47Table(db, "community_check_ins")
}

// Drop only the proven exact duplicate; retain the unique daily constraint.
// Fixed DDL avoids changing the behavior of historical AutoMigrate versions.
func migrateCheckinIndexV47Table(db *gorm.DB, table string) error {
	if !regexp.MustCompile(`^[a-z0-9_]+$`).MatchString(table) {
		return fmt.Errorf("invalid checkin table")
	}
	type column struct {
		ColumnName string
		NonUnique  int
		SubPart    *int
		Collation  string
		IndexType  string
	}
	read := func(name string) ([]column, error) {
		var columns []column
		err := db.Raw(`SELECT COLUMN_NAME, NON_UNIQUE, SUB_PART, COLLATION, INDEX_TYPE FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? ORDER BY seq_in_index`, table, name).Scan(&columns).Error
		return columns, err
	}
	valid := func(columns []column, nonUnique int) bool {
		if len(columns) != 2 {
			return false
		}
		for i, name := range []string{"user_id", "day"} {
			c := columns[i]
			if c.ColumnName != name || c.NonUnique != nonUnique || c.SubPart != nil || c.Collation != "A" || c.IndexType != "BTREE" {
				return false
			}
		}
		return true
	}
	unique, err := read("uk_community_checkin_day")
	if err != nil {
		return err
	}
	if !valid(unique, 0) {
		return fmt.Errorf("checkin unique index differs; preserve indexes and review manually")
	}
	duplicate, err := read("idx_community_checkin_user_day")
	if err != nil {
		return err
	}
	if len(duplicate) == 0 {
		return nil
	}
	if !valid(duplicate, 1) {
		return fmt.Errorf("checkin secondary index differs; preserve and review manually")
	}
	return db.Exec("ALTER TABLE `" + table + "` DROP INDEX idx_community_checkin_user_day").Error
}
