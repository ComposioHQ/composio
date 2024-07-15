"""Virtual file pointer implementation."""

import re
import typing as t
from pathlib import Path

import typing_extensions as te

from composio.utils.logging import WithLogger


ScrollDirection = t.Literal["up", "down"]
FileOperationScope = t.Literal["file", "window"]

SCROLL_UP = "up"
SCROLL_DOWN = "down"

SCOPE_FILE = "file"
SCOPE_WINDOW = "window"


class Match(te.TypedDict):
    """Match object."""

    start: int
    end: int
    content: str


class TextReplacement(te.TypedDict):
    """Text replacement response."""

    replaced_with: str
    replaced_text: str


class File(WithLogger):
    """File object for file manager."""

    _start: int
    _end: int

    def __init__(self, path: Path, window: t.Optional[int] = None) -> None:
        """Initialize file object."""
        super().__init__()
        self.path = path

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
        direction = direction or "down"
        lines = (lines or self._window) * (1 if direction == "down" else -1)
        self._start += lines
        self._end += lines

    def _find(self, buffer: str, pattern: str) -> t.List[Match]:
        """Find the occurences for given pattern in the buffer."""
        matches: t.List[Match] = []
        for match in re.finditer(pattern=pattern, string=buffer):
            start = match.start()
            end = match.end()
            matches.append(
                {
                    "content": match.string[start:end],
                    "start": start,
                    "end": end,
                }
            )
        return matches

    def _find_window(self, pattern: str) -> t.List[Match]:
        """Find in the current window."""
        return self._find(
            buffer=self.read(),
            pattern=pattern,
        )

    def _find_file(
        self,
        pattern: str,
    ) -> t.List[Match]:
        """Find in the whole file."""
        return self._find(buffer=self.path.read_text(encoding="utf-8"), pattern=pattern)

    def find(
        self,
        pattern: str,
        scope: t.Optional[FileOperationScope] = None,
    ) -> t.List[Match]:
        """
        Find pattern in the given file.

        :param pattern: Pattern to search for
        :param scope: Scope for the search, choose between `file` and `windows`.
            if you choose `file`, the search will be performed across the file else
            the search will be performed over the current view window.
        :return: List of matches found for the given pattern
        """
        scope = scope or "file"
        if scope == SCOPE_FILE:
            return self._find_file(pattern=pattern)
        return self._find_window(pattern=pattern)

    def read(self) -> str:
        """Read data from file."""
        cursor = 0
        buffer = ""
        with self.path.open("r") as fp:
            while cursor < self._start:
                _ = fp.readline()
                cursor += 1
            while cursor < self._end:
                buffer += fp.readline()
                cursor += 1
        return buffer

    def write(
        self,
        text: str,
        start: int,
        end: int,
    ) -> TextReplacement:
        """
        Write given content to file

        :param text: Content to write to file.
        :param start: Line number to start the edit at
        :param end: Line number where to end the edit
        :return: Replaced text
        """
        cursor = 0
        buffer = ""
        replaced = ""

        with self.path.open(mode="r") as fp:
            while cursor < (start - 1):
                buffer += fp.readline()
                cursor += 1

            while cursor < (end - 1):
                replaced += fp.readline()
                cursor += 1

            buffer += text
            while True:
                line = fp.readline()
                if not line:
                    break
                buffer += line

        self.path.write_text(data=buffer, encoding="utf-8")
        return {"replaced_text": replaced, "replaced_with": text}

    def __str__(self) -> str:
        """String representation."""
        return f"File(name={self.path})"
