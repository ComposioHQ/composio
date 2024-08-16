from PyPDF2 import PdfFileReader

def read_pdf(file_path: str) -> dict:
    """Read a PDF file and return the number of pages and metadata."""
    with open(file_path, 'rb') as f:
        reader = PdfFileReader(f)
        num_pages = reader.getNumPages()
        metadata = reader.getDocumentInfo()
        return {"num_pages": num_pages, "metadata": metadata}

def extract_text(file_path: str, page_number: int) -> str:
    """Extract text from a specific page in a PDF file."""
    with open(file_path, 'rb') as f:
        reader = PdfFileReader(f)
        if page_number < 0 or page_number >= reader.getNumPages():
            return "Invalid page number"
        page = reader.getPage(page_number)
        return page.extract_text()
