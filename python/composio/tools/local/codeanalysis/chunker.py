import re
from typing import Any, Dict, List, Tuple, Union

import tree_sitter_python as tspython
from tree_sitter import Language, Parser


PY_LANGUAGE = Language(tspython.language())


class Span:
    """
    Represents a span of text with start and end positions.
    """

    def __init__(self, start: int, end: int):
        """
        Initialize a Span object.

        Args:
            start (int): The starting position of the span.
            end (int): The ending position of the span.

        Raises:
            ValueError: If start is greater than end.
        """
        if start > end:
            raise ValueError(
                "Start position must be less than or equal to end position."
            )
        self.start = start
        self.end = end

    def extract(self, s: str) -> str:
        return "\n".join(s.splitlines()[self.start : self.end])  # noqa: E203

    def __add__(self, other: Union[int, "Span"]) -> "Span":
        if isinstance(other, int):
            return Span(self.start + other, self.end + other)

        if isinstance(other, Span):
            return Span(self.start, other.end)

        raise TypeError(
            f"Unsupported operand type for +: '{type(self).__name__}' and '{type(other).__name__}'"
        )

    def __len__(self) -> int:
        return self.end - self.start

    def __repr__(self) -> str:
        return f"Span(start={self.start}, end={self.end})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Span):
            return NotImplemented
        return self.start == other.start and self.end == other.end


def get_line_number(index: int, source_code: str) -> int:
    """
    Get the line number for a given character index in the source code.

    Args:
        index (int): The character index to find the line number for.
        source_code (str): The full source code string.

    Returns:
        int: The line number (0-indexed) corresponding to the given index.

    Raises:
        ValueError: If the index is negative or greater than the length of the source code.
    """
    if index < 0 or index > len(source_code):
        raise ValueError(f"Index {index} is out of range for the given source code.")

    lines = source_code.splitlines(keepends=True)
    total_chars = 0
    for line_number, line in enumerate(lines):
        total_chars += len(line)
        if total_chars > index:
            return line_number

    return len(lines) - 1


def count_length_without_whitespace(s: Union[str, bytes]) -> int:
    """
    Count the length of a string or bytes object after removing all whitespace.

    Args:
        s (Union[str, bytes]): The input string or bytes object.

    Returns:
        int: The length of the input after removing all whitespace.

    Raises:
        TypeError: If the input is neither a string nor a bytes object.
    """
    if isinstance(s, str):
        return len(re.sub(r"\s", "", s))

    if isinstance(s, bytes):
        return len(re.sub(rb"\s", b"", s))

    raise TypeError(f"Input must be str or bytes, not {type(s).__name__}")


def chunk_default(file_content: str, max_chunk_size: int) -> List[Span]:
    """
    Default chunking function for non-Python files.
    """

    def find_end_line(start_line: int, file_content: str) -> int:
        """
        Find the end line for a given start line in the file content.
        """
        end_line = start_line
        curr_chunk_size = 0
        lines = file_content.splitlines()
        while end_line < len(lines) and curr_chunk_size < max_chunk_size:
            curr_chunk_size += len(lines[end_line])
            end_line += 1
        return end_line

    curr_chunk = Span(0, 0)
    chunks = []
    lines = file_content.splitlines()
    while curr_chunk.start < len(lines):
        start_line = curr_chunk.start
        end_line = find_end_line(start_line, file_content)
        chunks.append(Span(start_line, end_line))
        if end_line >= len(lines):
            break
        curr_chunk = Span(end_line, end_line)

    return chunks


def chunker(tree, source_code_bytes, max_chunk_size=512 * 3, coalesce=50):
    """
    Chunk the abstract syntax tree (AST) of source code into manageable spans.

    This function recursively traverses the AST, creating chunks of code that respect
    the maximum chunk size. It then processes these chunks to ensure they meet
    certain criteria, such as minimum content length and the presence of line breaks.

    Args:
        tree: The root node of the AST.
        source_code_bytes (bytes): The source code as a bytes object.
        max_chunk_size (int, optional): The maximum size of a single chunk in bytes.
                                        Defaults to 1536 (512 * 3).
        coalesce (int, optional): The minimum number of non-whitespace characters
                                  a chunk should contain. Defaults to 50.

    Returns:
        List[Span]: A list of Span objects representing the final chunks of code,
                    where each Span contains the start and end line numbers.
    """

    def chunker_helper(node, source_code_bytes, start_position=0):
        chunks = []
        current_chunk = Span(start_position, start_position)

        for child in node.children:
            child_span = Span(child.start_byte, child.end_byte)

            if len(child_span) > max_chunk_size:
                chunks.append(current_chunk)
                chunks.extend(
                    chunker_helper(child, source_code_bytes, child.start_byte)
                )
                current_chunk = Span(child.end_byte, child.end_byte)
            elif len(current_chunk) + len(child_span) > max_chunk_size:
                chunks.append(current_chunk)
                current_chunk = child_span
            else:
                current_chunk += child_span
        if len(current_chunk) > 0:
            chunks.append(current_chunk)

        return chunks

    chunks = chunker_helper(tree.root_node, source_code_bytes)

    for prev, curr in zip(chunks[:-1], chunks[1:]):
        prev.end = curr.start

    new_chunks = []
    current_chunk = Span(0, 0)
    for chunk in chunks:
        current_chunk += chunk
        chunk_content = source_code_bytes[
            current_chunk.start : current_chunk.end  # noqa: E203
        ].decode("utf-8")
        if (
            count_length_without_whitespace(chunk_content) > coalesce
            and "\n" in chunk_content
        ):
            new_chunks.append(current_chunk)
            current_chunk = Span(chunk.end, chunk.end)

    if current_chunk:
        new_chunks.append(current_chunk)

    line_chunks = []
    for chunk in new_chunks:
        start_line = get_line_number(chunk.start, source_code=source_code_bytes)
        end_line = get_line_number(chunk.end, source_code=source_code_bytes)
        if start_line < end_line:
            line_chunks.append(Span(start_line, end_line))

    return line_chunks


class Chunking:
    """
    A class for chunking Python source code using tree-sitter.

    This class provides functionality to set up tree-sitter, load the Python language,
    and chunk Python source code into smaller, manageable pieces.

    Attributes:
        language (Language): The loaded Python language for tree-sitter parsing.

    Methods:
        chunk(): Chunks the given file content into smaller pieces.
    """

    def __init__(self, repo_dir: str):
        self.repo_dir = repo_dir

    def chunk(
        self,
        file_content: str,
        file_path: str,
        is_python: bool = True,
        score: float = 1.0,
        additional_metadata: Dict[str, str] = {},
        max_chunk_size: int = 512 * 3,
    ) -> Tuple[List[str], List[Dict[str, Any]], List[str]]:
        if is_python:
            parser = Parser(PY_LANGUAGE)
            tree = parser.parse(file_content.encode("utf-8"))

            source_code_bytes = file_content.encode("utf-8")
            spans = chunker(tree, source_code_bytes, max_chunk_size)
        else:
            spans = chunk_default(file_content, max_chunk_size)

        ids = [f"{file_path}:{span.start}:{span.end}" for span in spans]
        chunks = [span.extract(file_content) for span in spans]
        metadatas = [
            {
                "file_path": file_path,
                "repo_dir": self.repo_dir,
                "start": span.start,
                "end": span.end,
                "score": score,
                **additional_metadata,
            }
            for span in spans
        ]

        return chunks, metadatas, ids


def construct_chunks(  # pylint: disable=unused-argument
    chunks: List[str],
    metadatas: List[Dict[str, Any]],
    ids: List[str],
    num_lines: Dict[str, int],
) -> List[str]:
    """
    Construct formatted chunks with additional metadata.

    Args:
        chunks (List[str]): List of code chunks.
        metadatas (List[Dict[str, Any]]): List of metadata dictionaries for each chunk.
        ids (List[str]): List of unique identifiers for each chunk.
        num_lines (Dict[str, int]): Dictionary mapping file paths to their total number of lines.

    Returns:
        List[str]: List of formatted chunks with additional context.
    """
    formatted_chunks = []
    for chunk, metadata in zip(chunks, metadatas):
        file_path = metadata["file_path"]
        num_lines_in_file = num_lines[file_path]
        start = metadata["start"]
        end = metadata["end"]

        # Add line numbers to each line in the chunk
        numbered_chunk = "\n".join(
            f"{start + i + 1}| {line}" for i, line in enumerate(chunk.splitlines())
        )

        # Construct the formatted chunk with file information and context
        relative_file_path = file_path.replace(metadata["repo_dir"], "")
        if relative_file_path.startswith("/"):
            relative_file_path = relative_file_path[1:]

        formatted_chunk = (
            f"[File {relative_file_path} ({num_lines_in_file} lines total)]\n"
            f"({start} lines above)\n"
            f"{numbered_chunk}\n"
            f"({num_lines_in_file-end} lines below)"
        )

        # Update metadata with the formatted chunk
        metadata["chunk"] = formatted_chunk
        formatted_chunks.append(formatted_chunk)

    return formatted_chunks
