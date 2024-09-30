from typing import Dict
from pydantic import BaseModel, Field
from composio.tools.base.local import LocalAction
import os
from PyPDF2 import PdfReader
from .embedding_model import EmbeddingModel

class RagPDFAddRequest(BaseModel):
    pdf_metadata: str = Field(
        ...,
        description="The path to the PDF file",
        json_schema_extra={"file_readable": True},
    )

class RagPDFAddResponse(BaseModel):
    status: str = Field(..., description="Status of the addition to the knowledge base")


class AddPDFContentToRagTool(LocalAction[RagPDFAddRequest, RagPDFAddResponse]):
    _tags = ["Knowledge Base", "PDF", "Embeddings"]

    def execute(self, request: RagPDFAddRequest, metadata: Dict) -> RagPDFAddResponse:
        try:
            embedding_model = EmbeddingModel()

            pdf_path = request.pdf_metadata
            if not os.path.exists(pdf_path):
                raise FileNotFoundError(f"PDF file not found: {pdf_path}")

            reader = PdfReader(pdf_path)
            text = ""
            for page in reader.pages:
                text += page.extract_text()

            embeddings = embedding_model.generate_embeddings(text)

            self.knowledge_base = {}
            self.knowledge_base[pdf_path] = embeddings

            return RagPDFAddResponse(status="PDF content added successfully")

        except Exception as e:
            return RagPDFAddResponse(status=f"Failed to add PDF content: {str(e)}")
