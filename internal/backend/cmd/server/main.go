package main

import (
	"context"
	"log"

	"tarsgo-backend/config"
	"tarsgo-backend/database"
	"tarsgo-backend/router"
	"tarsgo-backend/service/runtimeconfig"
)

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

	if cfg.App.AutoMigrate {
		if err := database.RunMigrations(context.Background(), db, cfg.App.Env); err != nil {
			log.Fatalf("database migrations: %v", err)
		}
	}

	runtimeStore, err := runtimeconfig.NewStore(db, cfg)
	if err != nil {
		log.Fatalf("init runtime config store: %v", err)
	}

	engine := router.New(cfg, db, runtimeStore)
	addr := cfg.App.Address()

	log.Printf("backend started on %s (%s)", addr, cfg.App.Env)
	if err := engine.Run(addr); err != nil {
		log.Fatalf("run server: %v", err)
	}
}
