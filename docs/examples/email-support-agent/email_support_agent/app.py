from __future__ import annotations

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from email_support_agent.webhook import (
    InvalidWebhookError,
    build_webhook_record,
    persist_webhook_record,
    response_body_from_record,
)


load_dotenv()

app = FastAPI(title="Email Support Workflow Webhook", version="0.1.0")


@app.get("/")
async def root() -> dict[str, bool | str]:
    return {"ok": True, "service": "email-support-agent"}


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/webhook/composio")
async def composio_webhook(request: Request) -> JSONResponse:
    raw_body = await request.body()

    try:
        # build_webhook_record runs the full LangGraph workflow (including
        # multi-second OpenAI calls) synchronously, so offload it to a worker
        # thread to keep the event loop free for health checks and concurrent
        # webhook deliveries.
        record = await run_in_threadpool(
            build_webhook_record, headers=request.headers, raw_body=raw_body
        )
    except InvalidWebhookError as exc:
        return JSONResponse(
            status_code=401,
            content={"error": "invalid_webhook", "detail": str(exc)},
        )

    persist_webhook_record(record)
    if record.get("graph_result") and _webhook_debug_enabled():
        print(json.dumps({"action": record["action"], "graph_result": record["graph_result"]}), flush=True)
    return JSONResponse(response_body_from_record(record))


def _webhook_debug_enabled() -> bool:
    return os.getenv("WEBHOOK_DEBUG", "").lower() in {"1", "true", "yes"}
