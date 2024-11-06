"""Scaffolding utilities."""

import typing as t
from enum import Enum
from pathlib import Path

from swekit.exceptions import SWEKitError
from swekit.scaffold.templates import PATH as TEMPLATES_PATH


class AgentType(Enum):
    """Agent type."""

    SWE = "swe"
    PR_REVIEW = "pr_review"


class AgenticFramework(Enum):
    """Agent framework name."""

    CREWAI = "crewai"
    LLAMAINDEX = "llamaindex"
    LANGGRAPH = "langgraph"
    CAMELAI = "camelai"
    AUTOGEN = "autogen"

    def load_templates(self, agent_type: AgentType) -> t.Dict:
        """Load template string."""
        if agent_type == AgentType.SWE:
            return {
                file.name.replace(".template", ".py"): file.read_text(encoding="utf-8")
                for file in (TEMPLATES_PATH / "swe" / self.value).glob("*.template")
            }
        elif agent_type == AgentType.PR_REVIEW:
            return {
                file.name.replace(".template", ".py"): file.read_text(encoding="utf-8")
                for file in (TEMPLATES_PATH / "pr_review" / self.value).glob(
                    "*.template"
                )
            }


def scaffold(
    framework: AgenticFramework,
    name: t.Optional[str] = None,
    outdir: t.Optional[Path] = None,
    agent_type: AgentType = AgentType.SWE,
) -> Path:
    """Scaffold agent using Composio tools."""
    name = name or "agent"
    outdir = outdir or Path.cwd()
    if not outdir.exists():
        outdir.mkdir(parents=True)

    output = outdir / name
    if output.exists():
        raise SWEKitError(f"Directory already exists @ {output}")
    output.mkdir()

    for file, template in framework.load_templates(agent_type).items():
        (output / file).write_text(str(template), encoding="utf-8")

    return output
