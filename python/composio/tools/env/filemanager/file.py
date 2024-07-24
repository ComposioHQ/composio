"""Virtual file pointer implementation."""

import re
import subprocess
import sys
import typing as t
from enum import Enum
from pathlib import Path

import typing_extensions as te

from composio.utils.logging import WithLogger


SCROLL_UP = "up"
SCROLL_DOWN = "down"

SCOPE_FILE = "file"
SCOPE_WINDOW = "window"


class ScrollDirection(str, Enum):
    UP = "up"
    DOWN = "down"

    def offset(self, lines: int) -> int:
        """Multiply the window by scroll direction."""
        return lines * (-1 if self.value == "up" else 1)


class FileOperationScope(str, Enum):
    FILE = "file"
    WINDOW = "window"


class Match(te.TypedDict):
    """Match object."""

    content: str
    match: str
    end: int
    start: int
    lineno: int


class TextReplacement(te.TypedDict):
    """Text replacement response."""

    replaced_with: str
    replaced_text: str
    error: te.NotRequired[str]


class File(WithLogger):
    """File object for file manager."""

    _start: int
    _end: int

    def __init__(
        self,
        path: Path,
        workdir: Path,
        window: t.Optional[int] = None,
    ) -> None:
        """
        Initialize file object

        :param path: Path to file.
        :param workdir: Current working directory.
        :param window: Size of the view window, default is 100.
        """
        super().__init__()
        self.path = path
        self.workdir = workdir

        # View window
        self._start = 0
        self._end = window or 100
        self._window = window or 100

    def scroll(
        self,
        lines: t.Optional[int] = None,
        direction: t.Optional[ScrollDirection] = None,
    ) -> None:
        """
        Scroll to given number of lines.

        :param lines: Number of lines to scroll.
        :param direction: Direction of scrolling.
        :return: None
        """
        direction = direction or ScrollDirection.DOWN
        lines = direction.offset(lines or self._window)
        self._start += lines
        self._end += lines

    def goto(
        self,
        line: int,
    ) -> None:
        """
        Go to given line number.

        :param line: Line number to go to.
        :return: None
        """
        self._start = line
        self._end = line + self._window

    def _find(self, buffer: str, pattern: str, lineno: int) -> t.List[Match]:
        """Find the occurrences for given pattern in the buffer."""
        matches: t.List[Match] = []
        for match in re.finditer(pattern=pattern, string=buffer):
            start = match.start()
            end = match.end()
            matches.append(
                {
                    "content": match.string,
                    "match": match.string[start:end],
                    "end": end,
                    "start": start,
                    "lineno": lineno,
                }
            )
        return matches

    def _find_window(self, pattern: str) -> t.List[Match]:
        """Find in the current window."""
        offset = self._start
        matches = []
        for lineno, line in enumerate(self._iter_window()):
            matches += self._find(
                buffer=line,
                pattern=pattern,
                lineno=lineno + offset,
            )
        return matches

    def _find_file(
        self,
        pattern: str,
    ) -> t.List[Match]:
        """Find in the whole file."""
        matches = []
        for lineno, line in enumerate(self._iter_file()):
            matches += self._find(
                buffer=line,
                pattern=pattern,
                lineno=lineno,
            )
        return matches

    def find(
        self,
        pattern: str,
        scope: t.Optional[FileOperationScope] = None,
    ) -> t.List[Match]:
        """
        Find pattern in the given file.

        :param pattern: Pattern to search for
        :param scope: Scope for the search, choose between `file` and `window`.
            if you choose `file`, the search will be performed across the file else
            the search will be performed over the current view window.
        :return: List of matches found for the given pattern
        """
        scope = scope or FileOperationScope.FILE
        if scope == FileOperationScope.FILE:
            return self._find_file(pattern=pattern)
        return self._find_window(pattern=pattern)

    def _iter_window(self) -> t.Iterable[str]:
        """Iter data from the current window."""
        cursor = 0
        with self.path.open("r") as fp:
            while cursor < self._start:
                _ = fp.readline()
                cursor += 1
            while cursor < self._end:
                line = fp.readline()
                if not line:
                    break
                yield line
                cursor += 1

    def _iter_file(self) -> t.Iterable[str]:
        """Iter data from the current file."""
        with self.path.open(mode="r") as fp:
            while True:
                line = fp.readline()
                if not line:
                    break
                yield line

    def iter(self, scope: t.Optional[FileOperationScope] = None) -> t.Iterable[str]:
        """Iter data from the current window or file."""
        scope = scope or FileOperationScope.FILE
        if scope == FileOperationScope.WINDOW:
            return self._iter_window()
        return self._iter_file()

    def read(self) -> t.Dict[int, str]:
        """Read data from file."""
        cursor = 0
        buffer = {}
        with self.path.open("r") as fp:
            while cursor < self._start:
                _ = fp.readline()
                cursor += 1
            while cursor < self._end:
                line = fp.readline()
                if not line:
                    break
                buffer[cursor + 1] = line
                cursor += 1
        return buffer

    def write(self, text: str) -> None:
        """Write the given content to the file."""
        self.path.write_text(text, encoding="utf-8")

    def total_lines(self) -> int:
        """Total number of lines in the file."""
        return sum(1 for _ in self._iter_file())

    def edit(
        self,
        text: str,
        start: int,
        end: int,
        scope: t.Optional[FileOperationScope] = None,
    ) -> TextReplacement:
        """
        Write given content to file

        :param text: Content to write to file.
        :param scope: Scope of the file operation
        :param start: Line number to start the edit at
        :param end: Line number where to end the edit
        :return: Replaced text
        """
        text = text + "\n"
        scope = scope or FileOperationScope.FILE

        # Store original content
        original_content = self.path.read_text(encoding="utf-8")

        # Run lint before edit
        before_lint = self.lint()

        cursor = 0
        buffer = ""
        replaced = ""
        with self.path.open(mode="r") as fp:
            if scope == FileOperationScope.WINDOW:
                while cursor < self._start:
                    _ = fp.readline()
                    cursor += 1
                cursor = 0

            # Read lines before the edit
            while cursor < (start - 1):
                buffer += fp.readline()
                cursor += 1

            # Read lines to be replaced
            while cursor < end:
                replaced += fp.readline()
                cursor += 1

            # Add the new text
            buffer += text

            # Read the rest of the file
            buffer += fp.read()

        self.path.write_text(data=buffer, encoding="utf-8")

        # Run lint after edit
        after_lint = self.lint()

        self.logger.debug(f"Before lint: {before_lint}")
        self.logger.debug(f"After lint: {after_lint}")
        # Compare lint results
        new_lint_errors = self._compare_lint_results(before_lint, after_lint)

        if len(new_lint_errors) > 0:
            # Revert changes if new lint errors are found
            self.path.write_text(data=original_content, encoding="utf-8")
            formatted_errors = self._format_lint_errors(new_lint_errors)
            return {
                "replaced_text": "",
                "replaced_with": "",
                "error": f"Edit reverted due to new lint errors:\n{formatted_errors}",
            }
        return {
            "replaced_text": replaced,
            "replaced_with": text,
            "error": "",
        }

    def lint(self) -> t.List[str]:
        """Run lint on the file."""
        if self.path.suffix == ".py":
            venv_python = sys.executable
            try:
                result = subprocess.run(
                    [
                        venv_python,
                        "-m",
                        "flake8",
                        "--isolated",
                        "--select=E9,F821,F823,F831,F406,F407,F701,F702,F704,F706,E999,E902,E111,E112,E113",
                        str(self.path),
                    ],
                    capture_output=True,
                    text=True,
                    check=True,
                )
                lint_output = result.stdout
            except subprocess.CalledProcessError as e:
                # If flake8 returns a non-zero exit code, it will raise this exception
                lint_output = e.stdout  # Use stdout for linting errors
                if e.stderr:  # Check if there's any stderr output
                    lint_output += f"\nError running flake8: {e.stderr}"

            return [line.strip() for line in lint_output.split("\n") if line.strip()]
        return []

    def _compare_lint_results(
        self, before: t.List[str], after: t.List[str]
    ) -> t.List[str]:
        """Compare lint results before and after edit."""

        def parse_lint_error(error: str) -> t.Tuple[str, str]:
            """Parse a lint error into (error_code, error_message)."""
            parts = error.split(":", 3)
            if len(parts) >= 4:
                error_code = parts[3].split()[0]
                error_message = ":".join(parts[3:]).strip()
                return error_code, error_message
            return "", error

        before_errors = set(parse_lint_error(error) for error in before)
        after_errors = set(parse_lint_error(error) for error in after)

        new_errors = after_errors - before_errors
        return [f"{code}: {message}" for code, message in new_errors]

    def _format_lint_errors(self, errors: t.List[str]) -> str:
        """Format lint errors."""
        formatted_output = ""
        for error in errors:
            parts = error.split(":", 3)
            if len(parts) >= 4:
                file_path, line, column, message = parts
                formatted_output += f"- File: {file_path.strip()}, Line {line.strip()}, Column {column.strip()}: {message.strip()}\n"
            else:
                formatted_output += f"- {error}\n"
        return formatted_output.rstrip()

    def write_and_run_lint(self, text: str, start: int, end: int) -> TextReplacement:
        """Write and run lint on the file. If linting fails, revert the changes."""
        older_file_text = self.path.read_text(encoding="utf-8")
        write_response = self.edit(text=text, start=start, end=end)
        if write_response.get("error"):
            self.path.write_text(data=older_file_text, encoding="utf-8")
            return write_response
        return write_response

    def replace(self, string: str, replacement: str) -> TextReplacement:
        """Replace given string with replacement."""
        content = self.path.read_text(encoding="utf-8")
        update = re.sub(
            pattern=re.escape(string),
            repl=replacement,
            string=content,
        )
        if content == update:
            return {
                "replaced_text": "",
                "replaced_with": "",
                "error": "Error replacing given string, string not found",
            }
        self.path.write_text(update, encoding="utf-8")
        return {"replaced_text": string, "replaced_with": replacement}

    def __str__(self) -> str:
        """String representation."""
        return f"File(name={self.path})"
