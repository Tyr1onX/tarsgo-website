package main

import (
	"context"
	"log"

	"tarsgo-backend/config"
	"tarsgo-backend/database"
)

// The migration binary is intentionally separate from the web process so
// production can apply schema/data changes once before new instances receive traffic.
func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	db, err := database.New(cfg.Database)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("get sql db: %v", err)
	}
	defer sqlDB.Close()

	if err := database.RunMigrations(context.Background(), db, cfg.App.Env); err != nil {
		log.Fatalf("database migrations: %v", err)
	}
	log.Printf("database migrations completed (%s)", cfg.App.Env)
}
