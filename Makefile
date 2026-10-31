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
FRONTEND_PNPM      := COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm
FRONTEND_PNPM_VERSION := 9.15.4

.PHONY: help env install frontend frontend-toolchain frontend-install frontend-build frontend-embed frontend-test backend dev backend-up db-up db-down db-logs backend-test frontend-check fmt build build-linux-amd64 migrate-build clean secret-check

help:
	@echo ""
	@echo "TarsGo development commands:"
	@echo "  make env              Create backend .env from .env.example if absent"
	@echo "  make install          Install frontend and backend dependencies"
	@echo "  make frontend-install Install frontend dependencies from the lockfile"
	@echo "  make dev              Start database and backend in development mode"
	@echo "  make frontend         Start the frontend Vite dev server"
	@echo "  make backend          Start the Go backend server"
	@echo "  make backend-up      Alias for make dev"
	@echo "  make db-up            Start MariaDB with Docker Compose"
	@echo "  make db-down          Stop the local MariaDB container"
	@echo "  make db-logs          Follow MariaDB logs"
	@echo "  make backend-test     Run all Go backend tests"
	@echo "  make frontend-test    Run all frontend unit tests"
	@echo "  make frontend-check   Run frontend TypeScript checks"
	@echo "  make fmt              Format all Go source files"
	@echo "  make build            Build frontend and embedded backend binary"
	@echo "  make migrate-build    Build the standalone database migration binary"
	@echo "  make clean            Remove generated build output"
	@echo "  make secret-check     Scan tracked docs/config for obvious credentials"
	@echo ""

env:
	@if [[ -f "$(ENV_FILE)" ]]; then echo "$(ENV_FILE) already exists"; else cp "$(ENV_EXAMPLE)" "$(ENV_FILE)"; echo "Created $(ENV_FILE); review secrets before starting."; fi

frontend-toolchain:
	@node -e 'if (process.versions.node !== "22.23.4") { console.error("Frontend requires Node.js 22.23.4 (see internal/frontend/.nvmrc); found " + process.versions.node + "."); process.exit(1); }'
	@command -v corepack >/dev/null 2>&1 || { echo "Frontend requires Corepack; use the Node.js 22 runtime from internal/frontend/.nvmrc." >&2; exit 1; }
	@actual="$$(cd "$(FRONTEND_DIR)" && $(FRONTEND_PNPM) --version)"; if [[ "$$actual" != "$(FRONTEND_PNPM_VERSION)" ]]; then echo "Expected pnpm $(FRONTEND_PNPM_VERSION), got $$actual." >&2; exit 1; fi

frontend-install: frontend-toolchain
	@cd "$(FRONTEND_DIR)" && $(FRONTEND_PNPM) install --frozen-lockfile

install: frontend-install
	@go -C "$(BACKEND_DIR)" mod download

frontend: frontend-install
	@cd "$(FRONTEND_DIR)" && $(FRONTEND_PNPM) run dev

frontend-build: frontend-install
	@cd "$(FRONTEND_DIR)" && $(FRONTEND_PNPM) run build

frontend-embed: frontend-build
	@rm -rf "$(EMBED_DIR)"
	@mkdir -p "$(EMBED_DIR)"
	@cp -R "$(FRONTEND_BUILD_DIR)/." "$(EMBED_DIR)/"
	@touch "$(EMBED_DIR)/.keep"

backend: env
	@go -C "$(BACKEND_DIR)" run ./cmd/server

dev: env
	@./scripts/start-dev.sh

backend-up: dev

db-up: env
	@./scripts/start-db.sh

db-down:
	@docker compose -f "$(COMPOSE_FILE)" down

db-logs:
	@docker compose -f "$(COMPOSE_FILE)" logs -f mariadb

backend-test:
	@go -C "$(BACKEND_DIR)" test ./...

frontend-check: frontend-install
	@cd "$(FRONTEND_DIR)" && $(FRONTEND_PNPM) run typecheck

frontend-test: frontend-install
	@cd "$(FRONTEND_DIR)" && $(FRONTEND_PNPM) run test

fmt:
	@go -C "$(BACKEND_DIR)" fmt ./...

secret-check:
	@bash ./scripts/check-secrets.sh

build: frontend-embed
	@mkdir -p "$(DIST_DIR)"
	@go -C "$(BACKEND_DIR)" build -buildvcs=false -o "../../$(BACKEND_BINARY)" ./cmd/server
	@go -C "$(BACKEND_DIR)" build -buildvcs=false -o "../../$(DIST_DIR)/tarsgo-migrate" ./cmd/migrate
	@echo "Built $(BACKEND_BINARY) and $(DIST_DIR)/tarsgo-migrate"

migrate-build:
	@mkdir -p "$(DIST_DIR)"
	@go -C "$(BACKEND_DIR)" build -buildvcs=false -o "../../$(DIST_DIR)/tarsgo-migrate" ./cmd/migrate

build-linux-amd64: frontend-embed
	@mkdir -p "$(DIST_DIR)"
	@GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go -C "$(BACKEND_DIR)" build -buildvcs=false -o "../../$(DIST_DIR)/tarsgo-backend-linux-amd64" ./cmd/server
	@GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go -C "$(BACKEND_DIR)" build -buildvcs=false -o "../../$(DIST_DIR)/tarsgo-migrate-linux-amd64" ./cmd/migrate
	@sha256sum "$(DIST_DIR)/tarsgo-backend-linux-amd64" "$(DIST_DIR)/tarsgo-migrate-linux-amd64"

clean:
	@rm -rf "$(DIST_DIR)" "$(EMBED_DIR)"
