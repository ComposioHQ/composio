"""File manager."""

import os
import re
import subprocess
import threading
import typing as t
from fnmatch import translate
from pathlib import Path

import typing_extensions as te

from composio.tools.env.base import Sessionable
from composio.tools.env.filemanager.file import File
from composio.tools.env.id import generate_id


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


class FileManager(Sessionable):
    """File manager implementation for agent workspaces."""

    _files: t.Dict[Path, File]

    _pwd: t.Optional[Path] = None
    _recent: t.Optional[File] = None

    def __init__(self, working_dir: t.Optional[str] = None) -> None:
        """Initialize file manager."""
        super().__init__()
        self._id = generate_id()
        self._files = {}
        self.working_dir = Path(working_dir or "./").resolve()

    def setup(self) -> None:
        """Setup browser manager."""

    def teardown(self) -> None:
        """Teardown a browser manager."""

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

    def resolve_dir(self, dir: t.Union[Path, str]) -> Path:
        """Resolve a directory path."""
        return (
            Path(dir).resolve()
            if Path(dir).is_absolute()
            else (self.working_dir / dir).resolve()
        )

    def chdir(self, path: t.Union[Path, str]) -> None:
        """
        Change the current working directory.

        Args:
            path (Union[Path, str]): The path to the new working directory.
                Can be absolute, relative to the current working directory,
                or use '..' to navigate up the directory tree.

        Raises:
            FileNotFoundError: If the specified directory does not exist.
            PermissionError: If the user doesn't have permission to access the directory.
        """
        try:
            # Handle absolute, relative, and parent directory navigation
            new_dir = Path(path)
            if not new_dir.is_absolute():
                new_dir = (self.working_dir / new_dir).resolve()
            else:
                new_dir = new_dir.resolve()

            # Ensure the resolved path is within the allowed directory structure
            if not new_dir.is_relative_to(self.working_dir.anchor):
                raise PermissionError(f"Access denied: Cannot navigate to '{new_dir}'")

            if not new_dir.is_dir():
                raise FileNotFoundError(f"'{new_dir}' is not a valid directory.")
            if not os.access(new_dir, os.R_OK | os.X_OK):
                raise PermissionError(f"Permission denied: Cannot access '{new_dir}'")
            self.working_dir = new_dir
        except OSError as e:
            raise Exception(f"OS error: {str(e)}") from e

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

    def rename(self, old_file_path: str, new_file_path: str) -> bool:
        """
        Renames a file or directory.
        :param old_file_path: Path of the file, make sure the path is relative to
            the working directory.
        :param new_file_path: Path of the file, make sure the path is relative to
            the working directory.
        :return:
        """

        old_path = self.working_dir / old_file_path
        new_path = self.working_dir / new_file_path
        if not old_path.exists():
            raise FileNotFoundError(f"File / Directory {old_path} does not exist!")
        if new_path.exists():
            raise FileExistsError(f"File / Directory {new_path} already exists!")
        old_path.rename(new_path)
        return True

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

    def create_directory(self, path: t.Union[str, Path]) -> Path:
        """Create a new directory."""
        path = self.working_dir / path
        path.mkdir(parents=True, exist_ok=False)
        return path

    def grep(
        self,
        word: str,
        pattern: t.Optional[t.Union[str, Path]] = None,
        recursive: bool = True,
        case_insensitive: bool = True,
        exclude: t.Optional[t.List[t.Union[str, Path]]] = None,
    ) -> t.Dict[str, t.List[t.Tuple[int, str]]]:
        """
        Search for a word in files matching the given pattern.

        :param word: The term to search for
        :param pattern: The file, directory, or glob pattern to search in (if not provided, searches in the current working directory)
        :param recursive: If True, search recursively in subdirectories
        :param case_insensitive: If True, perform case-insensitive search (default is True)
        :param exclude: List of directory paths to exclude from the search
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

        exclude_paths = [self.working_dir / Path(ex) for ex in (exclude or [])]

        results: t.Dict[str, t.List[t.Tuple[int, str]]] = {}
        paths_to_search: t.List[Path] = []
        truncate_length = 1024

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
            # Skip if file is in an excluded directory
            if any(ex in file_path.parents for ex in exclude_paths):
                continue

            if file_path.is_file() and not file_path.name.startswith("."):
                try:
                    with file_path.open("r", encoding="utf-8") as f:
                        for i, line in enumerate(f, 1):
                            if case_insensitive:
                                word_lower = word.lower()
                                if word_lower in line.lower():
                                    rel_path = str(
                                        file_path.relative_to(self.working_dir)
                                    )
                                    if rel_path not in results:
                                        results[rel_path] = []
                                    results[rel_path].append(
                                        (
                                            i,
                                            (
                                                line.strip()[:truncate_length] + "..."
                                                if len(line.strip()) > truncate_length
                                                else line.strip()
                                            ),
                                        )
                                    )
                            else:
                                if word in line:
                                    rel_path = str(
                                        file_path.relative_to(self.working_dir)
                                    )
                                    if rel_path not in results:
                                        results[rel_path] = []
                                    results[rel_path].append(
                                        (
                                            i,
                                            (
                                                line.strip()[:truncate_length] + "..."
                                                if len(line.strip()) > truncate_length
                                                else line.strip()
                                            ),
                                        )
                                    )
                except UnicodeDecodeError:
                    # Skip binary files
                    pass

        if not results:
            self.logger.debug(f'No matches found for "{word}" in {pattern}')
            return {}

        num_matches: int = sum(len(matches) for matches in results.values())
        self.logger.debug(f'Found {num_matches} matches for "{word}" in {pattern}')
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

        include_paths = [
            self.resolve_dir(dir) for dir in (include or [self.working_dir])
        ]
        exclude_paths = [self.resolve_dir(dir) for dir in (exclude or [])] + [
            self.resolve_dir(".git")
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

                    relative_path = str(item.relative_to(self.working_dir))
                    if regex.match(relative_path):
                        matches.append(relative_path)

                    if item.is_dir():
                        search_recursive(item, current_depth + 1)
            except PermissionError:
                pass  # Skip directories we don't have permission to access

        for directory in include_paths:
            search_recursive(directory, 0)

        return sorted(matches)

    def _tree(
        self,
        directory: Path,
        level: int,
        depth: int,
        exclude: t.List[Path],
    ) -> str:
        """Auxiliary method for creating working directory tree recursively."""
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
            (
                str(path.relative_to(self.working_dir)),
                "dir" if path.is_dir() else "file",
            )
            for path in self.working_dir.iterdir()
        ]

    def current_dir(self) -> str:
        """Get the current working directory."""
        return str(self.working_dir)

    def execute_command(self, command: str) -> t.Tuple[str, t.Optional[str]]:
        """Execute a command in the current working directory."""
        try:
            result = subprocess.run(
                command,
                shell=True,
                check=True,
                capture_output=True,
                text=True,
                timeout=360,
                cwd=self.working_dir,
            )
            return result.stdout, None
        except subprocess.CalledProcessError as e:
            return "", f"Error executing command: {e.stderr}"
        except subprocess.TimeoutExpired:
            return "", "TIMEOUT: Command execution timed out after 120 seconds"
