package main

import (
	"log"

	"tarsgo-backend/config"
	"tarsgo-backend/database"
	"tarsgo-backend/router"
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

	if err := database.AutoMigrate(db); err != nil {
		log.Fatalf("auto migrate: %v", err)
	}

	engine := router.New(cfg, db)
	addr := cfg.App.Address()

	log.Printf("backend started on %s (%s)", addr, cfg.App.Env)
	if err := engine.Run(addr); err != nil {
		log.Fatalf("run server: %v", err)
	}
}
