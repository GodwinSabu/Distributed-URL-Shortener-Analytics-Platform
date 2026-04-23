.PHONY: up down logs backend consumer dashboard tf-init tf-plan tf-apply k8s-apply

# ── Local dev ─────────────────────────────────────────────────────────────────
up:
	docker compose up -d
	@echo "✅ Postgres, Redis, Kafka, ClickHouse running"

down:
	docker compose down

logs:
	docker compose logs -f

backend:
	cd url-shortener && bun dev

consumer:
	cd url-shortener && bun run consumer

dashboard:
	cd dashboard && npm run dev -- --port 3001

dev: up
	@echo "Start these in separate terminals:"
	@echo "  make backend"
	@echo "  make consumer"
	@echo "  make dashboard"

# ── Terraform ─────────────────────────────────────────────────────────────────
tf-init:
	cd infra/terraform/environments/dev && terraform init

tf-plan:
	cd infra/terraform/environments/dev && terraform plan

tf-apply:
	cd infra/terraform/environments/dev && terraform apply

tf-destroy:
	cd infra/terraform/environments/dev && terraform destroy

# ── Kubernetes ────────────────────────────────────────────────────────────────
k8s-apply:
	kubectl apply -f infra/k8s/namespaces.yaml
	kubectl apply -f infra/k8s/url-shortener/
	kubectl apply -f infra/k8s/consumer/
	kubectl apply -f infra/k8s/dashboard/
	kubectl apply -f infra/k8s/kafka/
	kubectl apply -f infra/k8s/clickhouse/
	kubectl apply -f infra/k8s/redis/
	kubectl apply -f infra/k8s/ingress/

k8s-status:
	kubectl get pods -n url-shortener
	kubectl get hpa  -n url-shortener
	kubectl get svc  -n url-shortener

k8s-logs-backend:
	kubectl logs -n url-shortener -l app=url-shortener -f

k8s-logs-consumer:
	kubectl logs -n url-shortener -l app=stream-processor -f

# ── Docker build + push ───────────────────────────────────────────────────────
REGISTRY ?= your-ecr-registry
TAG      ?= latest

build:
	docker build -t $(REGISTRY)/url-shortener:$(TAG) ./url-shortener
	docker build -t $(REGISTRY)/dashboard:$(TAG)     ./dashboard

push:
	docker push $(REGISTRY)/url-shortener:$(TAG)
	docker push $(REGISTRY)/dashboard:$(TAG)