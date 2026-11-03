package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"tarsgo-backend/serverruntime"

	"tarsgo-backend/config"
	"tarsgo-backend/database"
	"tarsgo-backend/router"
	"tarsgo-backend/service/auth"
	"tarsgo-backend/service/leave"
)

func main() {
	if err := run(); err != nil {
		log.Printf("server stopped: %v", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	db, err := database.New(cfg.Database)
	if err != nil {
		return err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	defer sqlDB.Close()

	if cfg.App.AutoMigrate {
		if err := database.RunMigrations(context.Background(), db, cfg.App.Env); err != nil {
			return err
		}
	}
	shutdownContext, stopSignals := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stopSignals()
	cleanupContext, cancelCleanup := context.WithCancel(shutdownContext)
	defer cancelCleanup()
	serverruntime.StartPoolStats(cleanupContext, sqlDB, log.Printf)
	auth.StartSessionCleanup(cleanupContext, db)
	leave.StartResultCleanup(cleanupContext, db)
	leave.StartDailyCollection(cleanupContext, leave.NewService(db))

	engine := router.New(cfg, db)
	addr := cfg.App.Address()

	log.Printf("backend started on %s (%s)", addr, cfg.App.Env)
	return serverruntime.Serve(shutdownContext, addr, engine)
}
