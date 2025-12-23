from fastapi import FastAPI, Request, HTTPException
from typing import Dict, Any
import uvicorn
import json
import hmac
import hashlib
import base64
import os

def verify_webhook_signature(request: Request, body: bytes) -> bool:
    """Verify Composio webhook signature"""
    webhook_signature = request.headers.get("webhook-signature")
    webhook_id = request.headers.get("webhook-id")
    webhook_timestamp = request.headers.get("webhook-timestamp")
    webhook_secret = os.getenv("COMPOSIO_WEBHOOK_SECRET")

    if not all([webhook_signature, webhook_id, webhook_timestamp, webhook_secret]):
        raise HTTPException(status_code=400, detail="Missing required webhook headers or secret")

    if not webhook_signature.startswith("v1,"):
        raise HTTPException(status_code=401, detail="Invalid signature format")

    received = webhook_signature[3:]
    signing_string = f"{webhook_id}.{webhook_timestamp}.{body.decode()}"
    expected = base64.b64encode(
        hmac.new(webhook_secret.encode(), signing_string.encode(), hashlib.sha256).digest()
    ).decode()

    if not hmac.compare_digest(received, expected):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    return True

@app.post("/webhook")
async def webhook_handler(request: Request):
    payload = await request.json()

    trigger_type = payload.get("type")
    event_data = payload.get("data", {})

    if trigger_type == "github_star_added_event":
        repo_name = event_data.get("repository_name")
        starred_by = event_data.get("starred_by")
        print(f"Repository {repo_name} starred by {starred_by}")
        # Add your business logic here

    return {"status": "success", "message": "Webhook processed"}

