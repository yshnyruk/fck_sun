.PHONY: backend frontend dev

backend:
	python -m uvicorn api.main:app --reload --host 127.0.0.1 --port 8000

frontend:
	npm --prefix web run dev -- --host 127.0.0.1 --port 5173

dev:
	$(MAKE) --jobs=2 backend frontend
