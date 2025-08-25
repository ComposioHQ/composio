import typing as t
import click
import pathlib

from dataclasses import dataclass

from composio import Composio
from composio.core.models.base import Resource


@dataclass
class Docstring:
    description: str
    params: dict
    returns: str
    examples: str
    raises: t.Optional[str] = None
    note: t.Optional[str] = None


def _dedent_examples(examples: str) -> str:
    indent = examples.index("```python")
    lines = examples.splitlines(keepends=True)[1:-1]
    examples = "".join(
        map(
            lambda line: (
                line[indent:] if not line.strip().startswith("#") else "\n" + line[indent:]
            ),
            lines,
        )
    )
    return f"```python\n{examples.lstrip()}```\n\n"


def _get_description(doc: str) -> str:
    if "Args:" in doc:
        return " ".join(map(str.strip, doc[: doc.index("Args:")].splitlines()))
    if "Returns:" in doc:
        return " ".join(map(str.strip, doc[: doc.index("Returns:")].splitlines()))
    if "Examples:" in doc:
        return " ".join(map(str.strip, doc[: doc.index("Examples:")].splitlines()))
    if "Raises:" in doc:
        return " ".join(map(str.strip, doc[: doc.index("Raises:")].splitlines()))
    if "Note:" in doc:
        return " ".join(map(str.strip, doc[: doc.index("Note:")].splitlines()))
    raise ValueError("No description found")


def parse(doc: str) -> Docstring:
    docspec: dict[str, t.Any] = {
        "description": _get_description(doc),
        "params": {},
        "returns": "",
        "examples": "",
    }
    lines = doc.splitlines()
    while lines:
        line = lines.pop(0)
        if line.lstrip().startswith("Args:"):
            params = []
            while lines:
                line = lines.pop(0).strip()
                if (
                    line.startswith("Returns:")
                    or line.startswith("Examples:")
                    or line.startswith("Raises:")
                    or line.startswith("Note:")
                ):
                    lines.insert(0, line)
                    break

                if ": " in line:
                    params.append(list(line.split(": ", 1)))
                    continue
                params[-1][1] += " " + line
            docspec["params"] = dict(params)
            continue

        if line.lstrip().startswith("Returns:"):
            returns = ""
            while lines:
                line = lines.pop(0)
                if (
                    line.strip().startswith("Examples:")
                    or line.strip().startswith("Raises:")
                    or line.strip().startswith("Note:")
                ):
                    lines.insert(0, line)
                    break
                returns += line + "\n"
            docspec["returns"] = returns.strip()
            continue

        if line.lstrip().startswith("Raises:"):
            raises = ""
            while lines:
                line = lines.pop(0)
                if line.strip().startswith("Examples:") or line.strip().startswith("Note:"):
                    lines.insert(0, line)
                    break
                raises += line + "\n"
            docspec["raises"] = raises.strip()
            continue

        if line.lstrip().startswith("Examples:"):
            examples = lines.pop(0) + "\n"
            while lines:
                line = lines.pop(0)
                if line.strip().startswith("Note:"):
                    lines.insert(0, line)
                    break

                examples += line + "\n"
                if line.strip().startswith("```"):
                    break

            docspec["examples"] = examples
            continue

        if line.lstrip().startswith("Note:"):
            note = ""
            while lines:
                line = lines.pop(0)
                if line.strip().startswith("```"):
                    break
                note += line + "\n"
            docspec["note"] = note.strip()
            continue

    return Docstring(**docspec)


def generate_docs(attr: str, docspec: dict) -> str:
    render = "# " + docspec["name"] + "\n\n"
    render += docspec["description"].strip() + "\n\n"
    for child in docspec["children"]:
        name = child["name"]
        render += f"## composio.{attr}.{name}\n\n"

        try:
            doc = parse(child["doc"])
        except Exception as e:
            raise RuntimeError(f"Error parsing docs for {name}") from e

        render += doc.description.strip() + "\n\n"
        if len(doc.params) > 0:
            render += "**Parameters**\n\n"
            for param_name, param_desc in doc.params.items():
                render += f"    - **{param_name}**: {param_desc}\n"

        render += "\n"
        if doc.returns:
            render += "**Returns**\n\n"
            render += "    - " + doc.returns
            render += "\n\n"

        if doc.raises:
            render += "**Raises**\n\n"
            render += "\n".join(map(lambda line: "    - " + line, doc.raises.splitlines()))
            render += "\n\n"

        if doc.examples:
            render += "**Examples**\n\n"
            render += _dedent_examples(doc.examples)

        if doc.note:
            render += f"**Note**: _{doc.note}_\n\n"

    return render


@click.command()
@click.option("--output", default="./output")
def build(output):
    """Build the Python SDK."""
    output = pathlib.Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    composio = Composio()
    for name in sorted(dir(composio)):
        if name.startswith("_"):
            continue

        child = getattr(composio, name)
        if not isinstance(child, Resource):
            continue

        try:
            render = generate_docs(name, child.__docspec__())
        except Exception as e:
            raise RuntimeError(f"Error generating docs for {name}") from e

        output.joinpath(name + ".md").write_text(render)

    print(output)


if __name__ == "__main__":
    build()
