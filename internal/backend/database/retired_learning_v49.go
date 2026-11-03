package database

import "gorm.io/gorm"

// Clear only the eight retired learning datasets explicitly approved for removal.
// Keep empty historical tables for the previous release's rollback compatibility.
// RunMigrations wraps this DML and the version marker in one transaction.
// No assignment, submission, recruitment, community XP or cultivation note is removed.
func clearRetiredLearningData(db *gorm.DB) error {
	for _, table := range []string{
		"skill_review_events", "skill_node_progress", "skill_node_assignments", "skill_node_prerequisites", "skill_nodes",
		"capability_manual_reviews", "capability_dimension_sources", "capability_dimensions",
	} {
		if err := db.Exec("DELETE FROM `" + table + "`").Error; err != nil {
			return err
		}
	}
	return nil
}
