import os

import psycopg

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://opencorp:opencorp_dev@localhost:5432/opencorp"
)


def get_conn():
    return psycopg.connect(DATABASE_URL, autocommit=True)


def log(agent: str, department: str, event: str, detail: dict | None = None):
    import json

    with get_conn() as conn:
        conn.execute(
            "INSERT INTO agent_log (agent, department, event, detail) VALUES (%s, %s, %s, %s)",
            (agent, department, event, json.dumps(detail or {}, ensure_ascii=False)),
        )
