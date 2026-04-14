SHELL := powershell.exe
.SHELLFLAGS := -NoProfile -Command

DEFAULT_BACKEND_DIR := internal/backend
.DEFAULT_GOAL := help

.PHONY: help frontend backend backend-test frontend-check install

help:
	@Write-Output ""
	@Write-Output "Available targets:"
	@Write-Output "  make frontend       Start the frontend dev server"
	@Write-Output "  make backend        Start the Go backend server"
	@Write-Output "  make backend-test   Run backend Go tests"
	@Write-Output "  make frontend-check Run frontend type checks"
	@Write-Output "  make install        Install frontend deps and sync backend modules"
	@Write-Output ""

frontend:
	@npm.cmd run dev

backend:
	@go -C "$(DEFAULT_BACKEND_DIR)" run ./cmd/server

backend-test:
	@go -C "$(DEFAULT_BACKEND_DIR)" test ./...

frontend-check:
	@npm.cmd run typecheck

install:
	@npm.cmd install
	@go -C "$(DEFAULT_BACKEND_DIR)" mod tidy
