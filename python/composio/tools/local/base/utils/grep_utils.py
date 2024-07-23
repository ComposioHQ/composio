# This file is based on code from
# https://github.com/paul-gauthier/grep-ast/blob/main/grep_ast/grep_ast.py

import os
from pathlib import Path

from composio.tools.local.base.utils.grep_ast import TreeContext
from composio.tools.local.base.utils.parser import filename_to_lang


def get_files_excluding_gitignore(root_path, no_gitignore=False, file_patterns=None):
    """
    Get all files matching the given patterns in the root path, excluding those specified in .gitignore.

    :param root_path: The root directory to start searching from.
    :param no_gitignore: If True, ignore .gitignore file.
    :param file_patterns: A list of file patterns to match. Defaults to ["*.py", "*.md"].
    :return: A list of file paths matching the patterns.
    """
    root_path = Path(root_path).resolve()
    gitignore = None

    if not no_gitignore:
        # Check root_path first
        potential_gitignore = root_path / ".gitignore"
        if potential_gitignore.exists():
            gitignore = potential_gitignore
        else:
            # Then check parent directories
            for parent in root_path.parents:
                potential_gitignore = parent / ".gitignore"
                if potential_gitignore.exists():
                    gitignore = potential_gitignore
                    break

    import pathspec  # TODO: simplify import  # pylint: disable=C0415

    if gitignore:
        with open(gitignore, "r", encoding="utf-8") as f:
            spec = pathspec.PathSpec.from_lines("gitwildmatch", f)
    else:
        spec = pathspec.PathSpec.from_lines("gitwildmatch", [])

    if file_patterns is None:
        file_patterns = ["*.[pP][yY]", "*.[mM][dD]", "*.[rR][sS][tT]", "*.[tT][xX][tT]"]

    files = []
    for pattern in file_patterns:
        for path in root_path.rglob(pattern):
            # Exclude .git and other version control system folders
            if any(part.startswith(".") and part != "." for part in path.parts):
                continue
            if path.is_file() and not spec.match_file(path):
                files.append(str(path))

    return files


# callable utility which works the same way as main.
def grep_util(
    pattern,
    filenames,
    encoding="utf8",
    color=None,
    verbose=False,
    line_number=True,
    ignore_case=True,
    no_gitignore=False,
):
    results = []

    for filename in filenames:
        if os.path.isdir(filename):
            dir_files = get_files_excluding_gitignore(filename, no_gitignore)
            for file in dir_files:
                results.extend(
                    process_file(
                        file,
                        pattern,
                        encoding,
                        ignore_case,
                        color,
                        verbose,
                        line_number,
                    )
                )
        else:
            results.extend(
                process_file(
                    filename,
                    pattern,
                    encoding,
                    ignore_case,
                    color,
                    verbose,
                    line_number,
                )
            )

    return results


def process_file(filename, pattern, encoding, ignore_case, color, verbose, line_number):
    file_results = []
    try:
        with open(filename, "r", encoding=encoding) as f:
            content = f.read()
    except UnicodeDecodeError:
        return file_results

    lang = filename_to_lang(filename)

    if lang:
        try:
            tc = TreeContext(
                filename, content, color=color, verbose=verbose, line_number=line_number
            )
            loi = tc.grep(pattern, ignore_case)
            if loi:
                tc.add_lines_of_interest(loi)
                tc.add_context()
                file_results.append({"filename": filename, "matches": tc.format()})
        except ValueError:
            pass  # Skip files that can't be parsed

    return file_results
