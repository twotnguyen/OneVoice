"""OpenCorp Orchestrator — trục điều phối AI + Mission Control tối giản.

Endpoint chính:
  GET  /                     Mission Control: nhân sự người+AI và nhật ký agent
  GET  /health               Kiểm tra sống
  POST /demo/content-run     Chạy vòng lặp Writer -> QC cho một sản phẩm (demo luồng dọc)
  POST /webhook/chatwoot     Nhận sự kiện từ Chatwoot (khung — nối tiếp ngày 02/09)
"""

import json

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse

from . import db
from .agents.content import run_content_pipeline

app = FastAPI(title="OpenCorp Orchestrator")


@app.get("/health")
def health():
    with db.get_conn() as conn:
        conn.execute("SELECT 1")
    return {"ok": True}


@app.post("/demo/content-run")
async def demo_content_run(sku: str = "GPU-4060"):
    with db.get_conn() as conn:
        row = conn.execute(
            "SELECT name, price_vnd, warranty_months, specs FROM products WHERE sku=%s", (sku,)
        ).fetchone()
    if not row:
        return {"error": f"Không có sản phẩm {sku}"}
    product = {"name": row[0], "price_vnd": row[1], "warranty_months": row[2], "specs": row[3]}
    return await run_content_pipeline(product)


@app.post("/webhook/chatwoot")
async def chatwoot_webhook(request: Request):
    payload = await request.json()
    db.log("CSKH-TuVan", "cskh", "tin_nhan_moi", {"raw": json.dumps(payload)[:800]})
    # TODO 02/09: phân loại nội dung -> tư vấn RAG / tạo ticket bảo hành / chuyển người thật
    return {"received": True}


@app.get("/", response_class=HTMLResponse)
def mission_control():
    with db.get_conn() as conn:
        staff = conn.execute(
            "SELECT name, kind, department, role FROM employees WHERE active ORDER BY department, kind"
        ).fetchall()
        logs = conn.execute(
            "SELECT created_at, agent, department, event, detail FROM agent_log ORDER BY id DESC LIMIT 30"
        ).fetchall()
    staff_rows = "".join(
        f"<tr><td>{'🤖' if k == 'ai' else '👤'} {n}</td><td>{d}</td><td>{r}</td></tr>"
        for n, k, d, r in staff
    )
    log_rows = "".join(
        f"<tr><td>{t:%H:%M:%S}</td><td>{a}</td><td>{d}</td><td>{e}</td>"
        f"<td><code>{json.dumps(det, ensure_ascii=False)[:120]}</code></td></tr>"
        for t, a, d, e, det in logs
    )
    return f"""<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>OpenCorp Mission Control</title>
<style>
 body{{font-family:system-ui;margin:2rem auto;max-width:960px;line-height:1.5;color:#1b2430}}
 h1{{font-size:1.4rem}} h2{{font-size:1.1rem;margin-top:2rem}}
 table{{border-collapse:collapse;width:100%;font-size:.9rem}}
 td,th{{border-bottom:1px solid #ddd;padding:.4rem .6rem;text-align:left;vertical-align:top}}
 code{{font-size:.8rem;color:#555}}
</style></head><body>
<h1>🏢 OpenCorp — Mission Control <small>(bản khung 31/08)</small></h1>
<h2>Nhân sự (người + đồng nghiệp AI)</h2>
<table><tr><th>Tên</th><th>Phòng ban</th><th>Vai trò</th></tr>{staff_rows}</table>
<h2>Nhật ký agent (30 gần nhất — tự F5 sau khi chạy <code>make demo-content</code>)</h2>
<table><tr><th>Lúc</th><th>Agent</th><th>Phòng</th><th>Sự kiện</th><th>Chi tiết</th></tr>{log_rows}</table>
</body></html>"""
