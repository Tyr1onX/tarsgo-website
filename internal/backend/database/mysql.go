package database

import (
	"fmt"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/config"
	"tarsgo-backend/model"
)

func New(cfg config.DatabaseConfig) (*gorm.DB, error) {
	db, err := gorm.Open(mysql.Open(cfg.DSN()), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open gorm connection: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("get sql connection: %w", err)
	}

	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetConnMaxLifetime(cfg.ConnMaxLifetime)

	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("ping mysql: %w", err)
	}

	return db, nil
}

func AutoMigrate(db *gorm.DB) error {
	if err := db.
		Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4").
		AutoMigrate(
			&model.Role{},
			&model.User{},
			&model.UserGroup{},
			&model.UserGroupMember{},
			&model.EmailCode{},
			&model.RegistrationForm{},
			&model.Registration{},
		); err != nil {
		return err
	}

	if err := dropLegacyRegistrationFormColumns(db); err != nil {
		return err
	}

	if err := seedRoles(db); err != nil {
		return err
	}

	return nil
}

func dropLegacyRegistrationFormColumns(db *gorm.DB) error {
	migrator := db.Migrator()
	if migrator.HasColumn(&model.RegistrationForm{}, "need_approval") {
		if err := migrator.DropColumn(&model.RegistrationForm{}, "need_approval"); err != nil {
			return fmt.Errorf("drop registration_forms.need_approval: %w", err)
		}
	}

	return nil
}

func Ping(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}

	return sqlDB.Ping()
}

func seedRoles(db *gorm.DB) error {
	seeds := []struct {
		Name        string
		DisplayName string
		Description string
		SortOrder   int
	}{
		{
			Name:        model.RoleNameSuperAdmin,
			DisplayName: "超级管理员",
			Description: "拥有所有权限，可管理其他管理员",
			SortOrder:   1,
		},
		{
			Name:        model.RoleNameAdmin,
			DisplayName: "普通管理员",
			Description: "可管理报名表和报名信息",
			SortOrder:   2,
		},
		{
			Name:        model.RoleNameUser,
			DisplayName: "普通用户",
			Description: "仅可填写和查看自己的报名",
			SortOrder:   3,
		},
	}

	for _, seed := range seeds {
		role := model.Role{Name: seed.Name}
		if err := db.
			Where("name = ?", seed.Name).
			Assign(map[string]any{
				"display_name": seed.DisplayName,
				"description":  seed.Description,
				"sort_order":   seed.SortOrder,
			}).
			FirstOrCreate(&role).Error; err != nil {
			return fmt.Errorf("seed role %s: %w", seed.Name, err)
		}
	}

	return nil
}
