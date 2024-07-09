"""Scaffolding utilities."""

import typing as t
from enum import Enum
from pathlib import Path

from swekit.exceptions import SWEKitError
from swekit.scaffold.templates import PATH as TEMPLATES_PATH


class AgenticFramework(Enum):
    """Agent framework name."""

    CREWAI = "crewai"
    LLAMAINDEX = "llamaindex"

    def load_templates(self) -> t.Dict:
        """Load tempalte string."""
        return {
            file.name.replace(".template", ".py"): file.read_text(encoding="utf-8")
            for file in (TEMPLATES_PATH / self.value).glob("*.template")
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
        raise SWEKitError(f"Directory already exists @ {output}")
    output.mkdir()

    for file, template in framework.load_templates().items():
        (output / file).write_text(str(template), encoding="utf-8")

    return output
