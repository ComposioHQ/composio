from typing import List
from composio.tools.local.doc_rag.constants import CHUNK_SIZE, CHUNK_OVERLAP

class TextChunker:
    def __init__(self, chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = ["\n\n", "\n", ". ", " ", ""]  

    def chunk(self, text: str) -> List[str]:
        chunks = self._split_recursive(text, self.separators)
        return self._add_overlap(chunks)

    def _split_recursive(self, text: str, separators: List[str]) -> List[str]:
        if len(text) <= self.chunk_size:
            return [text.strip()] if text.strip() else []

        sep = separators[0]
        next_seps = separators[1:]

        if sep:
            parts = text.split(sep)
        else:
            return [text[i:i+self.chunk_size] for i in range(0, len(text), self.chunk_size)]

        chunks = []
        current = ""

        for part in parts:
            part = part.strip()
            if not part:
                continue

            candidate = (current + sep + part).strip() if current else part

            if len(candidate) > self.chunk_size:
                if current:
                    chunks.extend(self._split_recursive(current, next_seps))
                current = part
            else:
                current = candidate

        if current:
            chunks.extend(self._split_recursive(current, next_seps))

        return chunks

    def _add_overlap(self, chunks: List[str]) -> List[str]:
        if not self.chunk_overlap or len(chunks) < 2:
            return chunks

        overlapped = []
        for i in range(len(chunks)):
            if i == 0:
                overlapped.append(chunks[i])
            else:
                prev = chunks[i - 1]
                prefix = prev[-self.chunk_overlap:] if len(prev) >= self.chunk_overlap else prev
                overlapped.append(prefix + chunks[i])
        return overlapped
