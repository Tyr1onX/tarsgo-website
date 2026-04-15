package database

import (
	"fmt"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"tarsgo-backend/auth"
	"tarsgo-backend/config"
	"tarsgo-backend/model"
	"tarsgo-backend/usergroup"
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

	return seedDefaultUsers(db)
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

func seedDefaultUsers(db *gorm.DB) error {
	seeds := []struct {
		RoleName           string
		Email              string
		Name               string
		Nickname           string
		Password           string
		AssignDefaultGroup bool
	}{
		{
			RoleName: model.RoleNameSuperAdmin,
			Email:    "admin@tarsgo.local",
			Name:     "admin",
			Nickname: "系统管理员",
			Password: "123456",
		},
		{
			RoleName: model.RoleNameAdmin,
			Email:    "manager@tarsgo.local",
			Name:     "manager",
			Nickname: "默认管理员",
			Password: "123456",
		},
		{
			RoleName:           model.RoleNameUser,
			Email:              "user@tarsgo.local",
			Name:               "user",
			Nickname:           "默认普通用户",
			Password:           "123456",
			AssignDefaultGroup: true,
		},
	}

	for _, seed := range seeds {
		if err := seedDefaultUser(db, seed.RoleName, seed.Email, seed.Name, seed.Nickname, seed.Password, seed.AssignDefaultGroup); err != nil {
			return err
		}
	}

	return nil
}

func seedDefaultUser(
	db *gorm.DB,
	roleName string,
	email string,
	name string,
	nickname string,
	password string,
	assignDefaultGroup bool,
) error {
	var role model.Role
	if err := db.Where("name = ?", roleName).First(&role).Error; err != nil {
		return fmt.Errorf("load role %s: %w", roleName, err)
	}

	passwordHash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hash password for %s: %w", email, err)
	}

	return db.Transaction(func(tx *gorm.DB) error {
		user := model.User{Email: email}
		if err := tx.
			Where("email = ?", email).
			Assign(map[string]any{
				"role_id":       role.ID,
				"name":          name,
				"password_hash": passwordHash,
				"nickname":      nickname,
				"status":        model.UserStatusEnabled,
			}).
			FirstOrCreate(&user).Error; err != nil {
			return fmt.Errorf("seed user %s: %w", email, err)
		}

		if assignDefaultGroup {
			if err := usergroup.AssignDefaultGroupTx(tx, user.ID); err != nil {
				return fmt.Errorf("assign default group to %s: %w", email, err)
			}
		}

		return nil
	})
}
