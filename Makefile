.PHONY: up down logs demo-content reset-demo

up:            ## Dựng lõi hạ tầng
	docker compose up -d --build

down:          ## Tắt toàn bộ
	docker compose --profile cskh down

logs:          ## Xem log orchestrator
	docker compose logs -f orchestrator

demo-content:  ## Chạy demo vòng lặp Writer -> QC
	curl -s -X POST "http://localhost:8000/demo/content-run?sku=GPU-4060" | python3 -m json.tool

reset-demo:    ## Xóa sạch dữ liệu, seed lại từ đầu (mất ~30s)
	docker compose down -v && docker compose up -d --build
