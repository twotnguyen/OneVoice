"""Xưởng nội dung: vòng lặp Writer -> QC (tối đa MAX_QC_ROUNDS vòng).

Đây là bản khung ngày 31/08 — đủ để demo luồng chạy thật với model local.
Việc tiếp theo (03/09): rubric QC đọc từ file Brand DNA, nhiều writer theo trụ nội dung.
"""

from .. import db, llm

MAX_QC_ROUNDS = 3

WRITER_SYSTEM = (
    "Bạn là nhân viên content của một cửa hàng máy tính. "
    "Viết caption Facebook tiếng Việt (80-120 chữ) giới thiệu sản phẩm được giao, "
    "giọng thân thiện, có 2-3 hashtag, KHÔNG bịa giá hay thông số ngoài dữ liệu được cho."
)

QC_SYSTEM = (
    "Bạn là trưởng phòng QC nội dung. Chấm caption theo 3 tiêu chí: "
    "(1) đúng thông tin sản phẩm được cho, không bịa; (2) giọng thân thiện, tự nhiên; "
    "(3) độ dài 80-120 chữ có hashtag. "
    "Trả lời đúng định dạng: dòng đầu là DAT hoặc CHUA_DAT, các dòng sau là nhận xét cụ thể."
)


async def run_content_pipeline(product: dict) -> dict:
    """Chạy một bài qua vòng lặp Writer -> QC. Trả về kết quả + lịch sử các vòng."""
    brief = (
        f"Sản phẩm: {product['name']} — giá {product['price_vnd']:,}đ, "
        f"bảo hành {product['warranty_months']} tháng, thông số: {product['specs']}"
    )
    history = []
    feedback = ""
    for round_no in range(1, MAX_QC_ROUNDS + 1):
        prompt = brief if not feedback else f"{brief}\n\nBài trước bị QC trả về với nhận xét:\n{feedback}\nHãy viết lại cho đạt."
        draft = await llm.chat(WRITER_SYSTEM, prompt)
        db.log("Writer-GioiThieu", "marketing", "nop_bai", {"round": round_no, "draft": draft[:500]})

        verdict = await llm.chat(QC_SYSTEM, f"{brief}\n\nCaption cần chấm:\n{draft}")
        passed = verdict.strip().upper().startswith("DAT")
        db.log(
            "QC-Truong-Phong", "marketing",
            "qc_dat" if passed else "qc_tra_ve",
            {"round": round_no, "feedback": verdict[:500]},
        )
        history.append({"round": round_no, "draft": draft, "verdict": verdict, "passed": passed})
        if passed:
            with db.get_conn() as conn:
                conn.execute(
                    "INSERT INTO posts (pillar, content, status, qc_round, qc_feedback) VALUES (%s,%s,%s,%s,%s)",
                    ("gioi_thieu", draft, "qc_passed", round_no, verdict),
                )
            return {"status": "qc_passed", "rounds": round_no, "history": history}
        feedback = verdict

    db.log("QC-Truong-Phong", "marketing", "leo_thang_nguoi_that", {"rounds": MAX_QC_ROUNDS})
    return {"status": "escalated_to_human", "rounds": MAX_QC_ROUNDS, "history": history}
