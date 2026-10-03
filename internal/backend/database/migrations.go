package database

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"

	"tarsgo-backend/model"
)

type migration struct {
	version uint64
	apply   func(db *gorm.DB) error
}

func migrationRegistry(appEnv string) []migration {
	return []migration{
		{version: 1, apply: func(db *gorm.DB) error { return AutoMigrate(db, appEnv) }},
		{version: 2, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.Announcement{},
				&model.AnnouncementTargetGroup{},
			)
		}},
		{version: 3, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.TeamEvent{},
				&model.TeamEventTargetGroup{},
			)
		}},
		{version: 4, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(
				&model.PortalLink{},
				&model.PortalLinkTargetGroup{},
			)
		}},
		{version: 5, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.ActivityEvent{})
		}},
		{version: 6, apply: migrateAdminScopes},
		{version: 7, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.Registration{}, &model.RegistrationInterview{})
		}},
		{version: 8, apply: func(db *gorm.DB) error {
			return db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.UserGroup{})
		}},
	}
}

// migrateAdminScopes introduces explicit administrator scope and normalizes
// historical group-member roles. It is deliberately data-driven so it works
// for both MySQL installations and the SQLite databases used by tests.
func migrateAdminScopes(db *gorm.DB) error {
	if err := db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").AutoMigrate(&model.User{}, &model.UserGroupMember{}); err != nil {
		return err
	}
	// Before this migration role=1 meant leader. The new enum reserves 1 for
	// group_admin and 2 for leader, so reinterpret existing rows explicitly.
	if err := db.Model(&model.UserGroupMember{}).Where("role = ?", 1).Update("role", 2).Error; err != nil {
		return err
	}

	var users []model.User
	if err := db.Preload("Role").Preload("GroupMembers", func(q *gorm.DB) *gorm.DB {
		return q.Order("joined_at ASC").Order("id ASC")
	}).Find(&users).Error; err != nil {
		return err
	}
	for i := range users {
		user := &users[i]
		// A super administrator can never belong to an ordinary group.
		if user.Role.Name == model.RoleNameSuperAdmin {
			if err := db.Where("user_id = ?", user.ID).Delete(&model.UserGroupMember{}).Error; err != nil {
				return err
			}
			if err := db.Model(&model.User{}).Where("id = ?", user.ID).Updates(map[string]any{"admin_scope": model.AdminScopeGlobal, "management_group_id": nil}).Error; err != nil {
				return err
			}
			continue
		}

		// Keep only the earliest management membership. Remaining memberships
		// stay intact but become ordinary members.
		var kept *model.UserGroupMember
		for j := range user.GroupMembers {
			member := &user.GroupMembers[j]
			if member.Role != model.UserGroupMemberRoleLeader && member.Role != model.UserGroupMemberRoleGroupAdmin {
				continue
			}
			if kept == nil {
				kept = member
				continue
			}
			if err := db.Model(&model.UserGroupMember{}).Where("id = ?", member.ID).Update("role", model.UserGroupMemberRoleMember).Error; err != nil {
				return err
			}
		}

		updates := map[string]any{"admin_scope": model.AdminScopeNone, "management_group_id": nil}
		switch user.Role.Name {
		case model.RoleNameAdmin:
			if kept != nil {
				updates["admin_scope"] = model.AdminScopeGroup
				updates["management_group_id"] = kept.GroupID
			} else {
				updates["admin_scope"] = model.AdminScopeGlobal
			}
		case model.RoleNameUser:
			if kept != nil {
				// Historical leaders were often stored with role=user; preserve
				// their management identity and promote the system role.
				updates["admin_scope"] = model.AdminScopeGroup
				updates["management_group_id"] = kept.GroupID
				updates["role_id"] = gorm.Expr("(SELECT id FROM roles WHERE name = ?)", model.RoleNameAdmin)
			} else {
				for _, member := range user.GroupMembers {
					if member.Role == model.UserGroupMemberRoleLeader || member.Role == model.UserGroupMemberRoleGroupAdmin {
						if err := db.Model(&model.UserGroupMember{}).Where("id = ?", member.ID).Update("role", model.UserGroupMemberRoleMember).Error; err != nil {
							return err
						}
					}
				}
			}
		}
		if err := db.Model(&model.User{}).Where("id = ?", user.ID).Updates(updates).Error; err != nil {
			return err
		}
	}
	var invalid int64
	if err := db.Model(&model.User{}).Joins("JOIN roles ON roles.id = users.role_id").Where("(roles.name = ? AND (users.admin_scope IS NULL OR users.admin_scope = ? OR users.admin_scope NOT IN (?, ?))) OR (roles.name = ? AND (users.admin_scope IS NULL OR users.admin_scope <> ? OR users.management_group_id IS NOT NULL)) OR (roles.name = ? AND users.management_group_id IS NOT NULL)", model.RoleNameAdmin, model.AdminScopeNone, model.AdminScopeGlobal, model.AdminScopeGroup, model.RoleNameUser, model.AdminScopeNone, model.RoleNameSuperAdmin).Count(&invalid).Error; err != nil {
		return err
	}
	if invalid > 0 {
		return fmt.Errorf("admin scope consistency check failed: %d users", invalid)
	}
	if err := db.Model(&model.UserGroupMember{}).Joins("JOIN users ON users.id = user_group_members.user_id").Joins("JOIN roles ON roles.id = users.role_id").Where("roles.name = ?", model.RoleNameSuperAdmin).Count(&invalid).Error; err != nil {
		return err
	}
	if invalid > 0 {
		return fmt.Errorf("super administrator group membership consistency check failed: %d memberships", invalid)
	}
	return nil
}

// RunMigrations applies every unapplied migration in order. Each version has
// its own transaction and is recorded only after its schema change succeeds.
func RunMigrations(ctx context.Context, db *gorm.DB, appEnv string) error {
	if db == nil {
		return fmt.Errorf("database is nil")
	}
	if err := db.WithContext(ctx).Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version BIGINT UNSIGNED PRIMARY KEY, applied_at DATETIME NOT NULL) ENGINE=InnoDB`).Error; err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	for _, item := range migrationRegistry(appEnv) {
		var count int64
		if err := db.WithContext(ctx).Table("schema_migrations").Where("version = ?", item.version).Count(&count).Error; err != nil {
			return fmt.Errorf("check migration %d: %w", item.version, err)
		}
		if count > 0 {
			continue
		}
		if err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			if err := item.apply(tx); err != nil {
				return err
			}
			return tx.Table("schema_migrations").Create(map[string]any{
				"version": item.version, "applied_at": time.Now(),
			}).Error
		}); err != nil {
			return fmt.Errorf("apply migration %d: %w", item.version, err)
		}
	}

	if err := seedDevelopmentMockData(db.WithContext(ctx), appEnv); err != nil {
		return fmt.Errorf("seed development data: %w", err)
	}
	return nil
}
