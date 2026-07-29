.PHONY: dev down logs shell mongo

dev:
	docker-compose up --build

down:
	docker-compose down

logs:
	docker-compose logs -f app

shell:
	docker-compose exec app sh

mongo:
	docker-compose exec mongo mongosh eonlinebazar
