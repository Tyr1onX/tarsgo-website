package database

import (
	"fmt"
	"log"
	"sort"
	"strings"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

// A retired default group is not an organization. Delete its row only when no
// current or historical business record still points to it; in particular,
// never allow a foreign-key cascade to erase weekly reports or audience rows.
func purgeUnreferencedDefaultGroupsV87(db *gorm.DB) error {
	var ids []uint64
	if err := db.Model(&model.UserGroup{}).Where("is_default = 1").Pluck("id", &ids).Error; err != nil {
		return err
	}
	if len(ids) == 0 {
		return nil
	}

	// This old scope field has no readers in the current authorization flow.
	if err := db.Exec(`UPDATE users AS u JOIN user_groups AS g ON g.id = u.management_group_id
		SET u.management_group_id = NULL WHERE g.is_default = 1`).Error; err != nil {
		return err
	}

	type reference struct {
		Table  string `gorm:"column:table_name"`
		Column string `gorm:"column:column_name"`
	}
	var foreignKeys []reference
	if err := db.Raw(`SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
		FROM information_schema.KEY_COLUMN_USAGE
		WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_SCHEMA = DATABASE()
		  AND REFERENCED_TABLE_NAME = 'user_groups'`).Scan(&foreignKeys).Error; err != nil {
		return err
	}

	// These group IDs are business references without an explicit foreign key.
	references := map[reference]struct{}{}
	for _, ref := range foreignKeys {
		references[ref] = struct{}{}
	}
	for _, ref := range []reference{
		{"assignments", "group_id"},
		{"practice_projects", "group_id"},
		{"member_cultivation_records", "group_id"},
		{"join_interests", "preferred_group_id"},
		{"training_grades", "group_id"},
		{"group_capability_dimensions", "group_id"},
		{"training_questions", "group_id"},
		{"expedition_project_milestones", "group_id"},
		{"expedition_project_participants", "group_id"},
		{"expedition_project_events", "group_id"},
	} {
		references[ref] = struct{}{}
	}

	var blockers []string
	for ref := range references {
		if !db.Migrator().HasTable(ref.Table) || !db.Migrator().HasColumn(ref.Table, ref.Column) {
			continue
		}
		quote := func(s string) string { return "`" + strings.ReplaceAll(s, "`", "``") + "`" }
		var count int64
		sql := fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE %s IN ?", quote(ref.Table), quote(ref.Column))
		if err := db.Raw(sql, ids).Scan(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			blockers = append(blockers, fmt.Sprintf("%s.%s=%d", ref.Table, ref.Column, count))
		}
	}
	if len(blockers) > 0 {
		sort.Strings(blockers)
		log.Printf("legacy default group retained: historical references exist (%s)", strings.Join(blockers, ", "))
		return nil
	}

	result := db.Where("is_default = 1").Delete(&model.UserGroup{})
	if result.Error != nil {
		return result.Error
	}
	log.Printf("removed %d unreferenced legacy default group(s)", result.RowsAffected)
	return nil
}