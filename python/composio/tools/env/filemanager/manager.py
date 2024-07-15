"""File manager."""

import os
import threading
import typing as t
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

    def _find_recursively(
        self,
        name: str,
        strict: bool,
        directory: Path,
        level: int,
        depth: int,
        exclude: t.List[Path],
    ) -> t.List[str]:
        """Auxiliary method for searching a directory recursively."""
        if directory in exclude:
            return []

        if depth != -1 and level > depth:
            return []

        matches = []
        for child in directory.iterdir():
            if child.is_dir():
                matches += self._find_recursively(
                    name=name,
                    strict=strict,
                    directory=child,
                    level=level + 1,
                    depth=depth,
                    exclude=exclude,
                )
                continue

            if name in (child.name if strict else child.name.lower()):
                matches.append(str(child.relative_to(self.working_dir)))
        return matches

    def find(
        self,
        name: str,
        depth: t.Optional[int] = None,
        strict: bool = False,
        include: t.Optional[t.List[t.Union[str, Path]]] = None,
        exclude: t.Optional[t.List[t.Union[str, Path]]] = None,
    ) -> t.List[str]:
        """
        Find file or directory with given name

        :param name: Name of the file to search for
        :param depth: Max depth to search for
        :param strict: If set `True` the search will be case sensitive
        :param include: List of directories to search in
        :param exclude: List of directories to exclude from the search
        :return: List of file paths matching the search pattern
        """
        found = []
        include = list(map(Path, (include or []) or [str(self.working_dir)]))
        exclude = list(map(Path, exclude or [])) + [".git"]
        for directory in include:
            found += self._find_recursively(
                name=name if strict else name.lower(),
                strict=strict,
                directory=Path(directory),
                level=-1,
                depth=depth or -1,
                exclude=exclude,  # type: ignore
            )
        return found

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

    def ls(self) -> t.List[str]:
        """List contents of the current directory."""
        return list(map(str, self.working_dir.iterdir()))
