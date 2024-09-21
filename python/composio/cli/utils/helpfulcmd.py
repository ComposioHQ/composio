import inspect
import typing as t

import click
from click.core import Context as ClickContext
from click.formatting import HelpFormatter


class HelpfulCmdBase:
    examples: list[str] = []
    help: t.Optional[str] = None

    def format_help_text(
        self,
        ctx: ClickContext,  # pylint: disable=unused-argument
        formatter: HelpFormatter,  # pylint: disable=unused-argument
    ) -> None:
        """Writes the help text to the formatter if it exists."""
        if self.help is not None:
            # truncate the help text to the first form feed
            text = inspect.cleandoc(self.help).partition("\f")[0]
        else:
            text = ""

        text = "📄" + text
        if getattr(self, "deprecated", False):
            text = f"(Deprecated) {text}"

        if text:
            formatter.write_paragraph()
            formatter.write_text(click.style(text, fg="white"))

    def format_options(self, ctx: ClickContext, formatter: HelpFormatter) -> None:
        """Writes all the options into the formatter if they exist."""
        opts = []
        for param in self.get_params(ctx):  # type: ignore
            rv = param.get_help_record(ctx)
            if rv is not None:
                if "-h" in rv[0] or "-help" in rv[0] or "--help" in rv[0]:
                    continue
                opts.append(rv)

        if opts:
            formatter.write(" 🔗 Options \n\n")
            formatter.write_dl(opts)

    def format_examples(
        self, ctx: ClickContext, formatter: HelpFormatter
    ):  # pylint: disable=unused-argument
        formatter.write("\n📙 Examples:\n\n")
        for example in self.examples:
            formatter.write(example)

    def format_help(self, ctx: ClickContext, formatter: HelpFormatter):
        formatter.write("\n")
        self.format_help_text(ctx, formatter)
        formatter.write("\n")
        self.format_options(ctx, formatter)
        self.format_examples(ctx, formatter)


class HelpfulCmd(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio login", fg="green")
        + click.style("  # Login with browser support\n", fg="black"),
        click.style("composio login --no-browser", fg="green")
        + click.style("  # Login without browser interaction\n", fg="black"),
    ]


class HelpfulGroup(HelpfulCmdBase, click.Group):
    pass
