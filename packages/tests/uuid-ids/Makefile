.PHONY: db psql test

db:
	docker-compose -f ../../integration-tests/docker-compose.yml up db-wait
	docker-compose -f ../../integration-tests/docker-compose.yml exec db ./reset.sh
	npm run migrate
	npm run codegen

psql:
	docker-compose -f ../../integration-tests/docker-compose.yml exec db ./console.sh

test:
	npm run test
