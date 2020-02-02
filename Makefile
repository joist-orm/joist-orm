.PHONY: compile build start db test redb

compile:
	rm -fr dist/
	npm install
	npm run graphql-codegen
	npm run build

build:
	docker-compose build

# the database and applies migrations; assumes we're not in docker.
db:
	docker-compose up -d db
	env STAGE=local npm run migrate

# Recreate the database for applying migrations from scratch.
redb:
	docker-compose up -d db
	docker-compose exec db ./reset-database.sh
	env STAGE=local npm run migrate
#	env STAGE=local npm run entity-codegen

psql:
	docker-compose exec db ./console.sh

# Runs the tests, assumes that `make db` has been ran.
test:
	npm run test
