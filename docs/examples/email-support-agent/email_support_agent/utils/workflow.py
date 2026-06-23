from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_WORKFLOW_PATH = "workflows/support_email.md"


@dataclass(frozen=True)
class WorkflowConfig:
    path: str
    markdown: str


def load_workflow_config() -> WorkflowConfig:
    """Load the Markdown support workflow selected by EMAIL_WORKFLOW_PATH."""
    path = os.getenv("EMAIL_WORKFLOW_PATH", DEFAULT_WORKFLOW_PATH)
    markdown = Path(path).read_text(encoding="utf-8")
    return WorkflowConfig(path=path, markdown=markdown)


def workflow_summary_for_state(markdown: str) -> dict[str, Any]:
    """Return a compact workflow summary for Notion logging."""
    title = "Email Workflow"
    for line in markdown.splitlines():
        if line.startswith("# "):
            title = line.removeprefix("# ").strip()
            break
    return {"title": title, "has_todos": "<TODO:" in markdown}
