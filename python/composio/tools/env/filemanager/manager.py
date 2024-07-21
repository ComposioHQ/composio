"""File manager."""

import os
import re
import threading
import typing as t
from fnmatch import translate
from pathlib import Path

import typing_extensions as te

from composio.tools.env.filemanager.file import File
from composio.tools.env.id import generate_id
from composio.utils.logging import WithLogger


_active_manager: t.Optional["FileManager"] = None
_manager_lock = threading.Lock()


def set_current_file_manager(manager: t.Optional["FileManager"]) -> None:
    """Set value for current file manager."""
    with _manager_lock:
        global _active_manager
        _active_manager = manager


def get_current_file_manager() -> t.Optional["FileManager"]:
    """Get active file manager."""
    with _manager_lock:
        manager = _active_manager
    return manager


class FindResult(te.TypedDict):
    """Find result."""

    file: str


class FileManager(WithLogger):
    """File manager implementation for agent workspaces."""

    _files: t.Dict[Path, File]

    _pwd: t.Optional[Path] = None
    _recent: t.Optional[File] = None

    def __init__(self, working_dir: t.Optional[str] = None) -> None:
        """Initialize file manager."""
        super().__init__()
        self.id = generate_id()
        self.working_dir = Path(working_dir or "./").resolve()

        self._files = {}

    @property
    def recent(self) -> t.Optional[File]:
        """Get the most recent file."""
        return self._recent

    def __enter__(self) -> te.Self:
        """Enter workspace context."""
        active_manager = get_current_file_manager()
        if active_manager is not None and active_manager.id != self.id:
            raise RuntimeError("Another manager already activated via context.")

        self._pwd = Path.cwd()
        os.chdir(self.working_dir)
        set_current_file_manager(manager=self)
        return self

    def __exit__(self, *args: t.Any, **kwargs: t.Any) -> None:
        """Exit from workspace context."""
        if self._pwd is not None:
            os.chdir(self._pwd)
        set_current_file_manager(manager=None)

    def chdir(self, path: t.Union[Path, str]) -> None:
        """Change the current working directory."""
        self.working_dir = Path(path).resolve()

    def open(self, path: t.Union[Path, str], window: t.Optional[int] = None) -> File:
        """
        Open a file

        :param path: Path of the file, make sure the path is relative to
            the working directory.
        :param window: View window for the file.
        :return: `File` object.
        """
        path = self.working_dir / path
        if path in self._files:
            return self._files[path]

        # TODO: Fuzzy search for relevant files
        if not path.exists():
            raise FileNotFoundError(f"File {path} does not exist!")
        file = File(path=path, workdir=self.working_dir, window=window)

        self._files[path] = file
        self._recent = self._files[path]
        return self._recent

    def create(self, path: t.Union[str, Path]) -> File:
        """
        Create a new file

        :param path: Path of the file you want to create.
        :return: Open `File` object
        """
        path = self.working_dir / path
        path.touch()

        file = File(path=path, workdir=self.working_dir)
        self._files[path] = file
        self._recent = self._files[path]
        return self._recent

    def grep(
        self,
        word: str,
        pattern: t.Optional[t.Union[str, Path]] = None,
        recursive: bool = True,
    ) -> t.Dict[str, t.List[t.Tuple[int, str]]]:
        """
        Search for a word in files matching the given pattern.

        :param word: The term to search for
        :param pattern: The file, directory, or glob pattern to search in (if not provided, searches in the current working directory)
        :param recursive: If True, search recursively in subdirectories
        :return: A dictionary with file paths as keys and lists of (line number, line content) tuples as values

        Examples of patterns:
        - "*.py" : Search in all Python files in the current directory
        - "src/*.txt" : Search in all text files in the 'src' directory
        - "**/*.md" : Search in all Markdown files in the current directory and all subdirectories
        - "/path/to/specific/file.js" : Search in a specific file
        - "/path/to/directory" : Search in all files in a specific directory
        """
        if pattern is None:
            pattern = self.working_dir
        else:
            pattern = Path(pattern)

        results: t.Dict[str, t.List[t.Tuple[int, str]]] = {}
        paths_to_search: t.List[Path] = []

        if pattern.is_file():
            paths_to_search = [pattern]
        elif pattern.is_dir():
            if recursive:
                paths_to_search = list(pattern.rglob("*"))
            else:
                paths_to_search = list(pattern.glob("*"))
        else:
            if recursive:
                paths_to_search = list(self.working_dir.rglob(str(pattern)))
            else:
                paths_to_search = list(self.working_dir.glob(str(pattern)))

        for file_path in paths_to_search:
            if file_path.is_file() and not file_path.name.startswith("."):
                try:
                    with file_path.open("r", encoding="utf-8") as f:
                        for i, line in enumerate(f, 1):
                            if word in line:
                                rel_path = str(file_path.relative_to(self.working_dir))
                                if rel_path not in results:
                                    results[rel_path] = []
                                results[rel_path].append((i, line.strip()))
                except UnicodeDecodeError:
                    # Skip binary files
                    pass

        if not results:
            print(f'No matches found for "{word}" in {pattern}')
            return {}

        num_matches: int = sum(len(matches) for matches in results.values())
        num_files: int = len(results)

        if num_files > 100:
            print(
                f'More than {num_files} files matched for "{word}" in {pattern}. Please narrow your search.'
            )
            return {}

        self.logger.info(f'Found {num_matches} matches for "{word}" in {pattern}')
        return results

    def find(
        self,
        pattern: str,
        depth: t.Optional[int] = None,
        case_sensitive: bool = False,
        include: t.Optional[t.List[t.Union[str, Path]]] = None,
        exclude: t.Optional[t.List[t.Union[str, Path]]] = None,
    ) -> t.List[str]:
        """
        Find files or directories matching the given pattern

        :param pattern: Pattern to search for (supports wildcards)
            Examples:
            - "*.py" : Find all Python files
            - "test_*.txt" : Find all text files starting with "test_"
            - "**/*.md" : Find all Markdown files in any subdirectory
            - "data???.csv" : Find CSV files with names like "data001.csv", "data002.csv", etc.
            - "src/**/main.js" : Find all "main.js" files in the "src" directory and its subdirectories
        :param depth: Max depth to search for (None for unlimited)
        :param case_sensitive: If set `True` the search will be case sensitive
        :param include: List of directories to search in
        :param exclude: List of directories to exclude from the search
        :return: List of file paths matching the search pattern
        """

        include_paths = [Path(dir).resolve() for dir in (include or [self.working_dir])]
        exclude_paths = [Path(dir).resolve() for dir in (exclude or [])] + [
            Path(".git").resolve()
        ]

        if case_sensitive:
            regex = re.compile(translate(pattern))
        else:
            regex = re.compile(translate(pattern), re.IGNORECASE)

        matches = []

        def search_recursive(directory: Path, current_depth: int):
            if depth is not None and current_depth > depth:
                return

            try:
                for item in directory.iterdir():
                    if item.resolve() in exclude_paths or any(
                        ex in item.resolve().parents for ex in exclude_paths
                    ):
                        continue

                    if regex.match(item.name):
                        matches.append(str(item.relative_to(self.working_dir)))

                    if item.is_dir():
                        search_recursive(item, current_depth + 1)
            except PermissionError:
                pass  # Skip directories we don't have permission to access

        for directory in include_paths:
            search_recursive(directory, 0)

        return matches

    def _tree(
        self,
        directory: Path,
        level: int,
        depth: int,
        exclude: t.List[Path],
    ) -> str:
        """Auxialiary method for creating working directory tree recursively."""
        if (depth != -1 and level > depth) or directory in exclude:
            return ""

        tree = ""
        for child in directory.iterdir():
            if child.is_file():
                tree += ("  |" * level) + "__ " + child.name + "\n"

        for child in directory.iterdir():
            if child.is_file():
                continue
            tree += ("  |" * level) + "__ " + child.name + "\n"
            tree += self._tree(
                directory=child,
                level=level + 1,
                depth=depth,
                exclude=exclude,
            )
        return tree

    def tree(
        self,
        depth: t.Optional[int] = None,
        exclude: t.Optional[t.List[str]] = None,
    ) -> str:
        """
        Create directory tree for the file

        :param depth: Max depth for the tree
        :param exclude: Exclude directories from the tree
        """
        return self._tree(
            directory=self.working_dir,
            level=0,
            depth=depth or -1,
            exclude=list(map(Path, exclude or [])) + [Path(".git").resolve()],
        )

    def ls(self) -> t.List[t.Tuple[str, str]]:
        """List contents of the current directory with their types."""
        return [
            (str(path), "dir" if path.is_dir() else "file")
            for path in self.working_dir.iterdir()
        ]
