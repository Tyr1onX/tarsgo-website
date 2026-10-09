package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"tarsgo-backend/config"
	"tarsgo-backend/database"
	"tarsgo-backend/model"
)

func main() {
	if len(os.Args) != 2 || os.Args[1] != "reset" {
		fmt.Fprintln(os.Stderr, "usage: acceptance-data reset")
		os.Exit(2)
	}
	cfg, err := config.Load()
	if err != nil {
		fatal(err)
	}
	if err := database.EnsureAcceptanceEnvironment(cfg.App.Env, cfg.Database.Host, cfg.Database.Port, cfg.Database.Name); err != nil {
		fatal(err)
	}
	db, err := database.New(cfg.Database)
	if err != nil {
		fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		fatal(err)
	}
	defer sqlDB.Close()
	var formIDs []uint64
	if err := db.Model(&model.RegistrationForm{}).Where("title = ?", database.AcceptanceFormTitle).Pluck("id", &formIDs).Error; err != nil {
		fatal(fmt.Errorf("find acceptance upload folders: %w", err))
	}
	uploadFolders := make([]string, 0, len(formIDs))
	for _, formID := range formIDs {
		folder, exists, err := acceptanceUploadFolder(os.Getenv("TARSGO_ACCEPTANCE_HOME"), formID)
		if err != nil {
			fatal(err)
		}
		if exists {
			uploadFolders = append(uploadFolders, folder)
		}
	}
	if err := database.ResetAcceptanceTestData(db.WithContext(context.Background()), cfg.App.Env, cfg.Database.Host, cfg.Database.Port, cfg.Database.Name); err != nil {
		fatal(err)
	}
	for _, folder := range uploadFolders {
		if err := os.RemoveAll(folder); err != nil {
			fatal(fmt.Errorf("remove acceptance form uploads: %w", err))
		}
	}
	fmt.Println("Acceptance test data reset; test accounts and group were preserved.")
}

func acceptanceUploadFolder(home string, formID uint64) (string, bool, error) {
	home = strings.TrimSpace(home)
	if home == "" || formID == 0 {
		return "", false, fmt.Errorf("acceptance upload cleanup requires the isolated state directory and form id")
	}
	root := filepath.Join(home, "upload", "recruitment")
	if !filepath.IsAbs(root) {
		return "", false, fmt.Errorf("acceptance state directory must be absolute")
	}
	for _, path := range []string{filepath.Join(home, "upload"), root} {
		info, err := os.Lstat(path)
		if os.IsNotExist(err) {
			return "", false, nil
		}
		if err != nil {
			return "", false, fmt.Errorf("inspect acceptance upload directory: %w", err)
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return "", false, fmt.Errorf("refusing acceptance upload cleanup through a non-directory or symlink")
		}
	}
	folder := filepath.Join(root, strconv.FormatUint(formID, 10))
	if filepath.Dir(folder) != root {
		return "", false, fmt.Errorf("refusing acceptance upload cleanup outside the test form directory")
	}
	info, err := os.Lstat(folder)
	if os.IsNotExist(err) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("inspect acceptance form upload directory: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return "", false, fmt.Errorf("refusing acceptance upload cleanup through a non-directory or symlink")
	}
	return folder, true, nil
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
