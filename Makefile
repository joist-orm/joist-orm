.PHONY: build db test redb

build:
	docker compose build

# Create/recreate the database for applying migrations from scratch.
db:
	docker compose up db --wait
	docker compose exec db ./reset.sh
	yarn migrate
	yarn codegen

psql:
	docker compose exec db ./console.sh

