from tree_sitter import Language
import subprocess
import re
from tree_sitter import Parser
from composio.tools.local.codeanalysis.constants import TREE_SITTER_CACHE


class Span:
    
    def __init__(self, start, end):
        self.start = start
        self.end = end

    def extract(self, s: str) -> str:
        return "\n".join(s.splitlines()[self.start:self.end])

    def __add__(self, other):
        if isinstance(other, int):
            return Span(self.start + other, self.end + other)
        elif isinstance(other, Span):
            return Span(self.start, other.end)
        else:
            raise NotImplementedError()

    def __len__(self):
        return self.end - self.start
    
def get_line_number(index: int, source_code: str) -> int:
    # unoptimized, use binary search
    lines = source_code.splitlines(keepends=True)
    total_chars = 0
    line_number = 0
    while total_chars <= index:
        if line_number == len(lines):
            return line_number
        total_chars += len(lines[line_number])
        line_number += 1
    return line_number - 1

def count_length_without_whitespace(s: str):
    string_without_whitespace = re.sub(r'\s', '', s)
    return len(string_without_whitespace)


def chunker(tree, source_code_bytes, max_chunk_size=512 * 3, coalesce=50):
    # Recursively form chunks with a maximum chunk size of max_chunk_size
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

    # removing gaps
    for prev, curr in zip(chunks[:-1], chunks[1:]):
        prev.end = curr.start

    # combining small chunks with bigger ones
    new_chunks = []
    i = 0
    current_chunk = Span(0, 0)
    while i < len(chunks):
        current_chunk += chunks[i]
        if count_length_without_whitespace(
                source_code_bytes[current_chunk.start:current_chunk.end].decode("utf-8")) > coalesce \
                and "\n" in source_code_bytes[current_chunk.start:current_chunk.end].decode("utf-8"):
            new_chunks.append(current_chunk)
            current_chunk = Span(chunks[i].end, chunks[i].end)
        i += 1
    if len(current_chunk) > 0:
        new_chunks.append(current_chunk)

    line_chunks = [Span(get_line_number(chunk.start, source_code=source_code_bytes),
                        get_line_number(chunk.end, source_code=source_code_bytes)) for chunk in new_chunks]
    line_chunks = [chunk for chunk in line_chunks if len(chunk) > 0]

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