SHELL := cmd.exe
.SHELLFLAGS := /C

DEFAULT_BACKEND_DIR := internal/backend
.DEFAULT_GOAL := help

.PHONY: help frontend backend backend-test frontend-check install

help:
	@echo.
	@echo Available targets:
	@echo   make frontend       Start the frontend dev server
	@echo   make backend        Start the Go backend server
	@echo   make backend-test   Run backend Go tests
	@echo   make frontend-check Run frontend type checks
	@echo   make install        Install frontend deps and sync backend modules
	@echo.

frontend:
	@npm run dev

backend:
	@cd /d "$(DEFAULT_BACKEND_DIR)" && go run ./cmd/server

backend-test:
	@cd /d "$(DEFAULT_BACKEND_DIR)" && go test ./...

frontend-check:
	@npm run typecheck

install:
	@npm install
	@cd /d "$(DEFAULT_BACKEND_DIR)" && go mod tidy
