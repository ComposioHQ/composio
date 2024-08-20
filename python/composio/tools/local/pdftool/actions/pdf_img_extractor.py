import os

from pdf2image import convert_from_path
from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class PdfImageExtractionRequest(BaseModel):
    pdf_path: str = Field(..., description="Path to input pdf file")
    output_folder: str = Field(..., description="Folder to save extracted images")


class PdfImageExtractionResponse(BaseModel):
    images: list[str] = Field(..., description="List of extracted image paths ")


class PdfImageExtractor(Action[PdfImageExtractionRequest, PdfImageExtractionResponse]):
    """
    Extracts images from a PDF file and saves them to the specified folder.
    """

    _display_name = "Extract PDF Images"
    _request_schema = PdfImageExtractionRequest
    _response_schema = PdfImageExtractionResponse
    _tags = ["pdf", "img_extraction"]
    _tool_name = "pdf_tool"

    def execute(
        self, request_data: PdfImageExtractionRequest, authorisation_data: dict
    ) -> dict:
        if authorisation_data is None:
            authorisation_data = {}

        pdf_path = request_data.model_dump()["pdf_path"]
        output_folder = request_data.model_dump()["output_folder"]
        os.makedirs(output_folder, exist_ok=True)

        try:
            images = convert_from_path(pdf_path)
            image_paths = []

            for i, image in enumerate(images):
                image_path = os.path.join(output_folder, f"page_{i + 1}.png")
                image.save(image_path, "PNG")
                image_paths.append(image_path)

            execution_details = {"executed": True}
            response_data = {"images": image_paths}
        except Exception as e:
            execution_details = {"executed": False}
            response_data = {"error": [str(e)]}

        return {"execution_details": execution_details, "response_data": response_data}
