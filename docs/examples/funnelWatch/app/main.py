"""Growth Pulse FastAPI app: ingestion webhook, dashboard, and read-only APIs."""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from starlette.requests import Request

from app import agent, durable, integrations, monitors, orchestrator, scheduler
from app.runtime import manager
from app.webhooks import router as webhooks_router

DASHBOARD = Path(__file__).resolve().parent / "dashboard"
templates = Jinja2Templates(directory=str(DASHBOARD / "templates"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    monitors.load_monitors()           # seeds monitors.json on first run
    manager.volume.sync_down()         # recover today's workspace from the mount on restart
    orchestrator.run_cycle(manager.volume)  # ensure analytics snapshots exist
    scheduler.start()
    from app import slackbot
    slackbot.announce_startup(manager.volume)  # "watching your growth and sales funnels…"
    yield


app = FastAPI(title="FunnelWatch", lifespan=lifespan)
app.include_router(webhooks_router)
app.mount("/static", StaticFiles(directory=str(DASHBOARD / "static")), name="static")


# --- dashboard ---
@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request):
    return templates.TemplateResponse(request, "index.html",
                                      {"session_date": manager.session_date})


# --- read-only data APIs ---
@app.get("/api/overview")
def api_overview():
    return manager.volume.read_json("analytics/daily_metrics.json", {})


@app.get("/api/plans")
def api_plans():
    return manager.volume.read_json("analytics/plan_comparison.json", {})


@app.get("/api/funnel")
def api_funnel():
    return manager.volume.read_json("analytics/funnel.json", {})


@app.get("/api/clicks")
def api_clicks():
    return manager.volume.read_json("analytics/clicks.json", {})


@app.get("/api/events")
def api_events(limit: int = 50):
    vol = manager.volume
    events = []
    for source, rel in [
        ("stripe", "raw/stripe_events.jsonl"),
        ("posthog", "raw/web_events.jsonl"),
        ("hubspot", "raw/hubspot_events.jsonl"),
        ("ads", "raw/ad_events.jsonl"),
    ]:
        for row in vol.read_jsonl(rel, tail=limit):
            item = dict(row)
            item["source_stream"] = source
            events.append(item)
    events.sort(key=lambda e: e.get("received_at", ""), reverse=True)
    return {"events": events[:limit]}


@app.get("/api/source-performance")
def api_source_performance():
    return manager.volume.read_json("analytics/source_performance.json", {})


@app.get("/api/source-health")
def api_source_health():
    return manager.volume.read_json("analytics/source_health.json", {})


@app.get("/api/insights")
def api_insights():
    return manager.volume.read_json("analytics/insights.json", {"insights": []})


@app.get("/api/recommendations")
def api_recommendations():
    vol = manager.volume
    return {
        "markdown": vol.read_text("analytics/recommendations.md", "# Recommendations\n\n_None yet._\n"),
        "outbox": vol.read_jsonl("analytics/slack_outbox.jsonl", tail=50)[::-1],
    }


@app.get("/api/reports")
def api_reports():
    vol = manager.volume
    return {
        "hourly": vol.read_text("reports/hourly_digest.md", "_No hourly digest yet._"),
        "daily": vol.read_text("reports/daily_summary.md", "_No daily summary yet._"),
    }


# --- monitors CRUD ---
class MonitorIn(BaseModel):
    # A custom alert is just a plain-English query; name/frequency/threshold are
    # derived from it. The remaining fields stay optional for power users / the API.
    question: str
    name: str | None = None
    frequency: str = "hourly"
    threshold: float | None = None
    data_sources: list[str] = ["stripe"]
    slack_channel: str | None = None
    enabled: bool = True


class MonitorPatch(BaseModel):
    name: str | None = None
    question: str | None = None
    frequency: str | None = None
    threshold: float | None = None
    enabled: bool | None = None
    slack_channel: str | None = None


@app.get("/api/monitors")
def api_monitors():
    return {"monitors": monitors.load_monitors()}


@app.post("/api/monitors")
def api_add_monitor(body: MonitorIn):
    return monitors.add_monitor(body.model_dump())


@app.patch("/api/monitors/{monitor_id}")
def api_update_monitor(monitor_id: str, body: MonitorPatch):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    m = monitors.update_monitor(monitor_id, patch)
    return m or {"error": "not found"}


@app.delete("/api/monitors/{monitor_id}")
def api_delete_monitor(monitor_id: str):
    return {"deleted": monitors.delete_monitor(monitor_id)}


# --- agent chat ---
class ChatIn(BaseModel):
    message: str


@app.post("/api/chat")
def api_chat(body: ChatIn):
    vol = manager.volume
    context = {
        "daily_metrics": vol.read_json("analytics/daily_metrics.json", {}),
        "plan_comparison": vol.read_json("analytics/plan_comparison.json", {}),
        "funnel": vol.read_json("analytics/funnel.json", {}),
        "button_clicks": vol.read_json("analytics/clicks.json", {}),
        "source_performance": vol.read_json("analytics/source_performance.json", {}),
        "insights": vol.read_json("analytics/insights.json", {}),
        # durable archive: prior-day rollups + previously saved artifacts, so the agent
        # can answer historical questions and reference what it has published.
        "history": durable.load_recent_summaries(30),
        "saved_artifacts": durable.list_artifacts(),
    }
    # deep_answer writes & runs ad-hoc analysis in the sandbox when the question needs
    # a slice the canned snapshots don't cover; otherwise it answers from context.
    return {"reply": agent.deep_answer(vol, body.message, context)}


# --- connected accounts ---
class IntegrationPatch(BaseModel):
    connected: bool


@app.get("/api/integrations")
def api_integrations():
    return {"integrations": integrations.load()}


@app.patch("/api/integrations/{key}")
def api_set_integration(key: str, body: IntegrationPatch):
    it = integrations.set_connected(key, body.connected)
    return it or {"error": "not found"}


# --- demo controls ---
@app.post("/api/refresh")
def api_refresh():
    vol = manager.volume
    real_time = orchestrator.run_cycle(vol, frequency="real-time", emit=True)
    hourly = orchestrator.run_cycle(vol, frequency="hourly", emit=True)
    return {"status": "ok", "fired": real_time["fired"] + hourly["fired"],
            "metrics": vol.read_json("analytics/daily_metrics.json", {}),
            "insights": hourly["insights"]}


@app.post("/api/run-daily")
def api_run_daily():
    return scheduler.run_daily()
