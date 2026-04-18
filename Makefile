SHELL := /bin/bash

DEFAULT_BACKEND_DIR := internal/backend
DEFAULT_FRONTEND_DIR := internal/frontend
.DEFAULT_GOAL := help

.PHONY: help frontend backend backend-test frontend-check install db-up backend-up

help:
	@echo ""
	@echo "Available targets:"
	@echo "  make frontend       Start the frontend dev server"
	@echo "  make db-up          Start the local MariaDB instance for backend dev"
	@echo "  make backend        Start the Go backend server"
	@echo "  make backend-up     Start the local MariaDB instance and backend server"
	@echo "  make backend-test   Run backend Go tests"
	@echo "  make frontend-check Run frontend type checks"
	@echo "  make install        Install frontend deps and sync backend modules"
	@echo ""

frontend:
	@cd $(DEFAULT_FRONTEND_DIR) && npm run dev

db-up:
	@powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-db.ps1

backend:
	@cd $(DEFAULT_BACKEND_DIR) && go run ./cmd/server

backend-up:
	@powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-db.ps1
	@go -C "$(DEFAULT_BACKEND_DIR)" run ./cmd/server

backend-test:
	@cd $(DEFAULT_BACKEND_DIR) && go test ./...

frontend-check:
	@cd $(DEFAULT_FRONTEND_DIR) && npm run typecheck

install:
	@cd $(DEFAULT_FRONTEND_DIR) && npm install
	@cd $(DEFAULT_BACKEND_DIR) && go mod tidy
