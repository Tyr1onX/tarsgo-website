SHELL := /bin/bash
.DEFAULT_GOAL := help

BACKEND_DIR        := internal/backend
FRONTEND_DIR       := internal/frontend
DIST_DIR           := dist
BACKEND_BINARY     := $(DIST_DIR)/tarsgo-backend
FRONTEND_BUILD_DIR := $(FRONTEND_DIR)/build/client
EMBED_DIR          := $(BACKEND_DIR)/web/frontend
ENV_FILE           := $(BACKEND_DIR)/.env
ENV_EXAMPLE        := $(BACKEND_DIR)/.env.example
COMPOSE_FILE       := database/docker-compose.yml
PACKAGE_MANAGER    := $(shell if command -v pnpm >/dev/null 2>&1; then echo pnpm; else echo npm; fi)

.PHONY: help env install frontend frontend-install frontend-build backend dev backend-up db-up db-down db-logs backend-test frontend-check fmt build clean secret-check

help:
	@echo ""
	@echo "TarsGo development commands:"
	@echo "  make env              Create backend .env from .env.example if absent"
	@echo "  make install          Install frontend and backend dependencies"
	@echo "  make dev              Start database and backend in development mode"
	@echo "  make frontend         Start the frontend Vite dev server"
	@echo "  make backend          Start the Go backend server"
	@echo "  make backend-up      Alias for make dev"
	@echo "  make db-up            Start MariaDB with Docker Compose"
	@echo "  make db-down          Stop the local MariaDB container"
	@echo "  make db-logs          Follow MariaDB logs"
	@echo "  make backend-test     Run all Go backend tests"
	@echo "  make frontend-check   Run frontend TypeScript checks"
	@echo "  make fmt              Format all Go source files"
	@echo "  make build            Build frontend and embedded backend binary"
	@echo "  make clean            Remove generated build output"
	@echo "  make secret-check     Scan tracked docs/config for obvious credentials"
	@echo ""

env:
	@if [[ -f "$(ENV_FILE)" ]]; then echo "$(ENV_FILE) already exists"; else cp "$(ENV_EXAMPLE)" "$(ENV_FILE)"; echo "Created $(ENV_FILE); review secrets before starting."; fi

frontend-install:
	@cd "$(FRONTEND_DIR)" && $(PACKAGE_MANAGER) install

install: frontend-install
	@go -C "$(BACKEND_DIR)" mod download

frontend:
	@cd "$(FRONTEND_DIR)" && $(PACKAGE_MANAGER) run dev

frontend-build:
	@cd "$(FRONTEND_DIR)" && $(PACKAGE_MANAGER) run build

backend: env
	@go -C "$(BACKEND_DIR)" run ./cmd/server

dev: env
	@./scripts/start-dev.sh

backend-up: dev

db-up: env
	@if command -v docker >/dev/null 2>&1; then ./scripts/start-db.sh; else powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\start-db.ps1; fi

db-down:
	@docker compose -f "$(COMPOSE_FILE)" down

db-logs:
	@docker compose -f "$(COMPOSE_FILE)" logs -f mariadb

backend-test:
	@go -C "$(BACKEND_DIR)" test ./...

frontend-check:
	@cd "$(FRONTEND_DIR)" && $(PACKAGE_MANAGER) run typecheck

fmt:
	@go -C "$(BACKEND_DIR)" fmt ./...

secret-check:
	@./scripts/check-secrets.sh

build: frontend-build
	@mkdir -p "$(DIST_DIR)"
	@rm -rf "$(EMBED_DIR)"
	@mkdir -p "$(EMBED_DIR)"
	@cp -R "$(FRONTEND_BUILD_DIR)/." "$(EMBED_DIR)/"
	@touch "$(EMBED_DIR)/.keep"
	@go -C "$(BACKEND_DIR)" build -buildvcs=false -o "../../$(BACKEND_BINARY)" ./cmd/server
	@echo "Built $(BACKEND_BINARY) with embedded frontend assets"

clean:
	@rm -rf "$(DIST_DIR)" "$(EMBED_DIR)"
