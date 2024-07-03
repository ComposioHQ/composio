"""Scaffolding utilities."""

import typing as t
import typing_extensions as te

from enum import Enum
from pathlib import Path

from composio_swe.exceptions import ComposioSWEError
from composio_swe.scaffold.templates import PATH as TEMPLATES_PATH


class Templates(te.TypedDict):
    """Collection of templates."""

    main: str
    agent: str
    benchmark: str


class AgenticFramework(Enum):
    """Agent framework name."""

    CREWAI = "crewai"
    LLAMAINDEX = "llamaindex"

    def load_templates(self) -> Templates:
        """Load tempalte string."""
        return {
            "main": (TEMPLATES_PATH / self.value / "main.template").read_text(
                encoding="utf-8"
            ),
            "agent": (TEMPLATES_PATH / self.value / "agent.template").read_text(
                encoding="utf-8"
            ),
            "benchmark": (TEMPLATES_PATH / self.value / "benchmark.template").read_text(
                encoding="utf-8"
            ),
        }


def scaffold(
    framework: AgenticFramework,
    name: t.Optional[str] = None,
    outdir: t.Optional[Path] = None,
) -> Path:
    """Scaffold agent using Composio tools."""
    name = name or "agent"
    outdir = outdir or Path.cwd()
    if not outdir.exists():
        outdir.mkdir(parents=True)

    output = outdir / name
    if output.exists():
        raise ComposioSWEError(f"Directory already exists @ {output}")
    output.mkdir()

    for file, template in framework.load_templates().items():
        (output / f"{file}.py").write_text(str(template), encoding="utf-8")

    return output
