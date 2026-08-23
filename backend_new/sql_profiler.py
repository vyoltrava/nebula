import os
import time
import logging

from sqlalchemy import event
from database import engine

logger = logging.getLogger("slow_sql")

SLOW_SQL_MS = float(os.getenv("SLOW_SQL_MS", "100"))


@event.listens_for(engine, "before_cursor_execute")
def before_cursor_execute(
    conn, cursor, statement, parameters, context, executemany
):
    conn.info.setdefault("query_start_time", []).append(time.perf_counter())


@event.listens_for(engine, "after_cursor_execute")
def after_cursor_execute(
    conn, cursor, statement, parameters, context, executemany
):
    start_times = conn.info.get("query_start_time")

    if not start_times:
        return

    start = start_times.pop()
    ms = (time.perf_counter() - start) * 1000

    if ms >= SLOW_SQL_MS:
        clean_statement = " ".join(statement.split())
        logger.warning(
            "[SQL] SLOW %.1fms | %s",
            ms,
            clean_statement[:300],
        )