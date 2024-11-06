"""Virtual file pointer implementation."""

import re
import subprocess
import sys
import typing as t
from collections import deque
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
    _history: deque  # TOFIX: Possible memory leak

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
        self._history = deque(maxlen=10)  # Store last 10 versions

    def scroll(
        self,
        lines: t.Optional[int] = None,
        to_line: t.Optional[int] = None,
        direction: t.Optional[ScrollDirection] = None,
    ) -> None:
        """
        Scroll to given number of lines.

        :param lines: Number of lines to scroll.
        :param to_line: Line number to scroll to.
        :param direction: Direction of scrolling.
        :return: None
        """
        direction = direction or ScrollDirection.DOWN
        if to_line:
            half_window = self._window // 2
            if to_line < half_window:
                self._start = 0
                self._end = self._window
            if to_line > self.total_lines() - half_window:
                self._start = self.total_lines() - self._window
                self._end = self.total_lines()
            else:
                self._start = to_line - half_window
                self._end = to_line + half_window
        else:
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
        total_lines = self.total_lines()
        if line >= total_lines:
            raise Exception(
                f"Line number {line} is out of bounds for file with {total_lines} lines"
            )
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
        self._history.append(self.path.read_text(encoding="utf-8"))
        self.path.write_text(text, encoding="utf-8")

    def total_lines(self) -> int:
        """Total number of lines in the file."""
        return sum(1 for _ in self._iter_file())

    def format_text(self, lines: t.Dict[int, str]) -> str:
        """Format the text to be written to the file."""
        total_lines = self.total_lines()
        code = ""
        if len(lines) == 0:
            return code
        code += f"[File: {self.path}] ({total_lines} lines total)]\n"
        code += f"({list(lines.keys())[0] - 1} line above)\n"
        max_line_num_width = len(str(max(lines.keys())))
        code += "\n".join(
            f"{line_num:<{max_line_num_width}}:{line_content.rstrip()}"
            for line_num, line_content in lines.items()
        )
        code += f"\n({total_lines - list(lines.keys())[-1]} line below)\n"
        return code

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
        :param end: Line number before which to end the edit
        :return: Replaced text
        """
        text = text + "\n"
        scope = scope or FileOperationScope.FILE
        end = end - 1
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
            if end > 0:
                while cursor <= end:
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
        new_lint_errors = self._compare_lint_results(
            before=before_lint, after=after_lint
        )

        if len(new_lint_errors) > 0:
            # Revert changes if new lint errors are found
            formatted_errors = self._format_lint_errors(errors=new_lint_errors)
            formatted_output = formatted_errors + self._show_file_modifications(
                start=start,
                end=end,
                original_content=original_content,
                buffer=buffer,
                text=text,
            )
            return {
                "replaced_text": "",
                "replaced_with": "",
                "error": f"Edit reverted due to new lint errors:\n{formatted_output}",
            }

        start_original = max(0, start - 5)
        end_original = min(len(original_content.splitlines()), end + 5)

        start_new = max(0, start - 5)
        end_new = min(self.total_lines(), start + len(text.splitlines()) + 5)

        return {
            "replaced_text": self.format_text(
                {
                    x + 1: original_content.splitlines()[x]
                    for x in range(start_original, end_original)
                }
            ),
            "replaced_with": self.format_text(
                {x + 1: buffer.splitlines()[x] for x in range(start_new, end_new)}
            ),
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

        def parse_lint_error(error: str) -> t.Tuple[str, str, str, str, str]:
            """Parse a lint error into (file_name, line_number, error_code, error_message)."""
            parts = error.split(":", 3)
            if len(parts) >= 4:
                file_name = parts[0]
                line_number = parts[1]
                column_number = parts[2]
                error_code = parts[3].split()[0]
                error_message = ":".join(parts[3:]).strip()
                return file_name, line_number, column_number, error_code, error_message
            return "", "", "", "", error

        before_errors = set(
            (error_code, error_message)
            for _, _, _, error_code, error_message in map(parse_lint_error, before)
        )
        after_errors = set(
            (error_code, error_message)
            for _, _, _, error_code, error_message in map(parse_lint_error, after)
        )

        new_errors = after_errors - before_errors
        return [
            f"{file_name}:{line_number}:{column_number} - {code}: {message}"
            for file_name, line_number, column_number, code, message in map(
                parse_lint_error, after
            )
            if (code, message) in new_errors
        ]

    def _format_lint_errors(
        self,
        errors: t.List[str],
    ) -> str:
        """Format a single lint error."""
        formatted_output = ""
        file_lines = self.path.read_text(encoding="utf-8").splitlines()
        for error in errors:
            parts = error.split(":", 3)
            if len(parts) >= 4:
                file_path, line, column, message = parts
                line_content = file_lines[int(line.strip()) - 1]
                formatted_output += f"- File: {file_path.strip()}, Line {line.strip()}, Column {column.strip()}: {message.strip()}\n"
                formatted_output += f"  Error code line: {line_content.strip()}\n"

                # Add description and next action based on error code
                error_code = message.split()[0]
                description, next_action = self._get_error_info(error_code)
                formatted_output += f"  Description: {description}\n"
                formatted_output += f"  Next Action: {next_action}\n"
            else:
                formatted_output += f"- {error}\n"
        return formatted_output.rstrip()

    def _show_file_modifications(
        self,
        start: int,
        end: int,
        original_content: str,
        buffer: str,
        text: str,
    ) -> str:
        """Show file modifications."""
        formatted_output = "\n"

        start_new = max(0, start - 5)
        end_new = min(self.total_lines(), start + len(text.splitlines()) + 5)
        replaced_with = self.format_text(
            {x + 1: buffer.splitlines()[x] for x in range(start_new, end_new)}
        )
        formatted_output += f"How your edit would have looked...\n{replaced_with}\n"

        self.path.write_text(data=original_content, encoding="utf-8")
        start_original = max(0, start - 5)
        end_original = min(self.total_lines(), end + 5)
        replaced_text = self.format_text(
            {
                x + 1: original_content.splitlines()[x]
                for x in range(start_original, end_original)
            }
        )
        formatted_output += f"The original code before your edit...\n{replaced_text}\n"

        formatted_output += (
            "Your changes have not been applied. Fix your edit command and try again.\n"
        )

        return formatted_output.rstrip()

    def _get_error_info(self, error_code: str) -> t.Tuple[str, str]:
        """Get description and next action for a given error code."""
        error_info = {
            "E9": (
                "SyntaxError or IndentationError",
                "Check your syntax and indentation. If you add a newline, make sure the indentation is correct.",
            ),
            "F821": ("Undefined name", "Define the variable before using it"),
            "F823": (
                "Local variable referenced before assignment",
                "Assign a value to the variable before using it",
            ),
            "F831": (
                "Duplicate argument name in function definition",
                "Rename one of the duplicate arguments",
            ),
            "F406": (
                "Module level import not at top of file",
                "Move the import statement to the top of the file",
            ),
            "F407": (
                "Future import should be first non-docstring statement",
                "Move the future import to the top of the file",
            ),
            "F701": (
                "Multiple statements on one line (colon)",
                "Split the statements into separate lines",
            ),
            "F702": (
                "Multiple statements on one line (semicolon)",
                "Split the statements into separate lines",
            ),
            "F704": (
                "Multiple statements on one line (def)",
                "Split the statements into separate lines",
            ),
            "F706": (
                "Multiple statements on one line (lambda)",
                "Split the statements into separate lines",
            ),
            "E999": (
                "SyntaxError",
                "Check your syntax/indentation for errors. If you add a newline, make sure the indentation is correct.",
            ),
            "E902": ("IOError", "Check file permissions and path"),
            "E111": (
                "Indentation is not a multiple of four",
                "Adjust the indentation to be a multiple of four spaces",
            ),
            "E112": ("Expected an indented block", "Add indentation to the block"),
            "E113": ("Unexpected indentation", "Remove unexpected indentation"),
        }
        return error_info.get(
            error_code,
            ("Unknown error", "Review the error message and fix accordingly"),
        )

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

    def undo(self) -> t.Optional[str]:
        """Undo the last edit."""
        if not self._history:
            return None
        previous_content = self._history.pop()
        self.path.write_text(previous_content, encoding="utf-8")
        return previous_content

    def __str__(self) -> str:
        """String representation."""
        return f"File(name={self.path})"
