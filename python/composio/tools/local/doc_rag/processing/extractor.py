import os
from abc import ABC, abstractmethod
import docx
import pypdf

from composio.utils.logging import get as get_logger


logger = get_logger("DocRAG")

class TextExtractor(ABC):
    @abstractmethod
    def extract(self, file_path: str) -> str:
        pass

class TxtExtractor(TextExtractor):
    def extract(self, file_path: str) -> str:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            logger.error(f"failed to read {file_path}: {e}")
            return ""


class PdfExtractor(TextExtractor):
    def extract(self, file_path: str) -> str:
        try:
            with open(file_path, "rb") as f:
                reader = pypdf.PdfReader(f)
                text = ""
                for page in reader.pages:
                    text += page.extract_text() or ""
                return text
        except Exception as e:
            logger.error(f"failed to read {file_path}: {e}")
            return ""


class DocxExtractor(TextExtractor):
    def extract(self, file_path: str) -> str:
        try:
            doc = docx.Document(file_path)
            return "\n".join([paragraph.text for paragraph in doc.paragraphs])
        except Exception as e:
            logger.error(f"failed to read {file_path}: {e}")
            return ""


class MarkdownExtractor(TextExtractor):
    def extract(self, file_path: str) -> str:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            logger.error(f"failed to read {file_path}: {e}")
            return ""


class ExtractorRegistry:
    def __init__(self):
        self._extractors = {
            ".txt": TxtExtractor(),
            ".pdf": PdfExtractor(),
            ".docx": DocxExtractor(),
            ".md": MarkdownExtractor(),
        }

    def get_extractor(self, file_path: str) -> TextExtractor | None:
        ext = os.path.splitext(file_path)[1].lower()
        return self._extractors.get(ext)
