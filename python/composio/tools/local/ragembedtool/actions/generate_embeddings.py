from typing import Dict

from numpy import ndarray
from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


class GenerateEmbeddingsRequest(BaseModel):
  path: str = Field(
    ...,
    description="path to the file or folder",
    examples=["/path/to/file.py", "/path/to/file.docx", "/path/to/folder"],
  )


class GenerateEmbeddingsResponse(BaseModel):
  status: str = Field(..., description="Status of the response")
  text_chunks: list = Field(..., description="Text chunks of the file or folder")
  embeddings: ndarray = Field(..., description="Embeddings of the file or folder")



class GenerateEmbeddings(LocalAction[GenerateEmbeddingsRequest, GenerateEmbeddingsResponse]):
  """Generate embeddings from text data."""

  def get_text_from_pdf(self,pdf_path):

    try:
        import PyPDF2
    except ImportError as e:
        raise ImportError(f"Failed to import PyPDF2 from PyPDF2 (run pip install PyPDF2): {e}") from e

    text = ""
    with open(pdf_path, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            text += page.extract_text() + "\n"
    return text

  # Function to extract text from DOCX
  def get_text_from_docx(self,docx_path):

    try:
        import docx
    except ImportError as e:
        raise ImportError(f"Failed to import docx from docx (run pip install python-docx): {e}") from e


    # get text data from docx file 
    doc = docx.Document(docx_path) # type: ignore
    return "\n".join([para.text for para in doc.paragraphs])
  

  def load_text(self, path): 
    from pathlib import Path
    path = Path(path)
    texts = []
    if path.is_file():
        extension = path.suffix
        if extension == ".pdf":
            text = self.get_text_from_pdf(path.resolve())
        elif extension == ".docx":
            text = self.get_text_from_docx(path.resolve())
        texts.append(text)

    elif path.is_dir():
        
        for file in path.iterdir():
            extension = file.suffix
            if extension == ".pdf":
                text = self.get_text_from_pdf(file)
            elif extension == ".docx":
                text = self.get_text_from_docx(file)
            else:
               continue
                # raise ValueError(f"Unsupported file type: {file}")
            texts.append(text)
            
    else:
        raise ValueError("The path is neither a file nor a directory.")
    
    return texts

  def execute(self, request: GenerateEmbeddingsRequest, metadata: Dict) -> GenerateEmbeddingsResponse:
     
    # load text data from given path
    texts = self.load_text(request.path)

    if not texts:
        raise ValueError("No text data found for the given path.")

    # generate embeddings
    try:
       from sentence_transformers import SentenceTransformer
    except ImportError as e:
       raise ImportError(f"Failed to import SentenceTransformer from sentence_transformers: {e}") from e

    model = SentenceTransformer('all-MiniLM-L6-v2')
    embeddings = model.encode(texts)
    

    return GenerateEmbeddingsResponse(status="Embedding generated successfully", text_chunks= texts, embeddings=embeddings)
    
    
  
  