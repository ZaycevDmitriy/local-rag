# Makefile для Local RAG
# Использование: make help

SHELL := /bin/bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

# Определение переменных.
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT  := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")

.DEFAULT_GOAL := help

##@ Основные

.PHONY: help
help: ## Показать справку
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.PHONY: build
build: ## Сборка TypeScript
	npm run build

.PHONY: dev
dev: ## Запуск без сборки (через tsx)
	npx tsx src/cli.ts status

.PHONY: clean
clean: ## Очистка артефактов сборки
	rm -rf dist/

##@ Качество кода

.PHONY: lint
lint: ## Запуск ESLint
	npm run lint

.PHONY: typecheck
typecheck: ## Проверка типов TypeScript
	npm run typesCheck

.PHONY: test
test: ## Запуск тестов
	npm test

.PHONY: ci
ci: lint typecheck test build ## Полная проверка (lint + types + test + build)

##@ Docker — Инфраструктура

.PHONY: db-up
db-up: ## Поднять PostgreSQL
	docker compose up -d

.PHONY: db-down
db-down: ## Остановить PostgreSQL
	docker compose down

.PHONY: db-reset
db-reset: ## Пересоздать PostgreSQL (удалить данные)
	docker compose down -v
	docker compose up -d

.PHONY: db-logs
db-logs: ## Логи PostgreSQL
	docker compose logs -f postgres

.PHONY: db-init
db-init: ## Инициализация схемы БД
	npx tsx src/cli.ts init

##@ Индексация

.PHONY: index-all
index-all: ## Индексация всех источников из конфига
	npx tsx src/cli.ts index --all

.PHONY: status
status: ## Статус системы
	npx tsx src/cli.ts status

.PHONY: list
list: ## Список источников
	npx tsx src/cli.ts list

##@ Разработка

.PHONY: setup
setup: db-up db-init ## Полная настройка (PostgreSQL + миграции)
	@echo "Готово. Запустите: make index-all"

.PHONY: mcp-inspect
mcp-inspect: build ## Запуск MCP Inspector
	npx @modelcontextprotocol/inspector node dist/mcp-entry.js --config ./rag.config.yaml

.PHONY: install-global
install-global: build ## Глобальная установка CLI
	npm install -g .
