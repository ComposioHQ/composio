from tree_sitter import Language
import subprocess
import re
from tree_sitter import Parser
from composio.tools.local.codeanalysis.constants import TREE_SITTER_CACHE


from typing import Union


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
            raise ValueError("Start position must be less than or equal to end position.")
        self.start = start
        self.end = end

    def extract(self, s: str) -> str:
        return "\n".join(s.splitlines()[self.start:self.end])

    def __add__(self, other: Union[int, 'Span']) -> 'Span':
        if isinstance(other, int):
            return Span(self.start + other, self.end + other)
        elif isinstance(other, Span):
            return Span(self.start, other.end)
        else:
            raise TypeError("Unsupported operand type for +: '{}' and '{}'".format(type(self).__name__, type(other).__name__))

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

import re
from typing import Union

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
        return len(re.sub(r'\s', '', s))
    elif isinstance(s, bytes):
        return len(re.sub(rb'\s', b'', s))
    else:
        raise TypeError(f"Input must be str or bytes, not {type(s).__name__}")

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
                chunks.extend(chunker_helper(child, source_code_bytes, child.start_byte))
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
        chunk_content = source_code_bytes[current_chunk.start:current_chunk.end].decode("utf-8")
        if (count_length_without_whitespace(chunk_content) > coalesce and
            "\n" in chunk_content):
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

    def __init__(self):
        subprocess.run(
            f"git clone https://github.com/tree-sitter/tree-sitter-python {TREE_SITTER_CACHE}/python",
            shell=True)
        Language.build_library(f'{TREE_SITTER_CACHE}/build/python.so', [f"{TREE_SITTER_CACHE}/python"])
        subprocess.run(f"cp {TREE_SITTER_CACHE}/build/python.so /tmp/python.so", shell=True) 
        self.language = Language(f"/tmp/python.so", "python")

    def chunk(
            self,
            file_content: str,
            file_path: str,
            score: float = 1.0,
            additional_metadata: dict[str, str] = {},
            max_chunk_size: int = 512 * 3,
            chunk_size: int = 30,
            overlap: int = 15
    ):

        parser = Parser()
        parser.set_language(self.language)
        tree = parser.parse(bytes(file_content, "utf-8"))
        ids = []
        metadatas = []

        source_code_bytes = bytes(file_content, "utf-8")
        spans = chunker(tree, source_code_bytes, max_chunk_size)
        ids = [f"{file_path}:{span.start}:{span.end}" for span in spans]
        chunks = [span.extract(file_content) for span in spans]
        
        for span in spans:
            metadata = {
                "file_path": file_path,
                "start": span.start,
                "end": span.end,
                **additional_metadata
            }
            metadatas.append(metadata)
        
        return chunks, metadatas, ids


def construct_chunks(chunks, metadatas, ids, num_lines):
    rets = []
    for i, (id, chunk, metadata) in enumerate(zip(ids, chunks, metadatas)):
        file_path = metadata["file_path"]
        num_lines_in_file = num_lines[file_path]
        start = metadata["start"]
        end = metadata["end"]
        chunk = "\n".join([f"{start+i+1}| {x}" for i,x in enumerate(chunk.splitlines())])
        chunk = f"""[File {file_path} ({num_lines_in_file} lines total)]\n({start} lines above)\n{chunk}\n({num_lines_in_file-end} lines below)"""
        metadatas[i]["chunk"] = chunk
        rets.append(chunk)
    return rets