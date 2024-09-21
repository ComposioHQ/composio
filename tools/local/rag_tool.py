
import os
import PyPDF2
import openai
import faiss
import numpy as np
from composio.tools.base import Tool


class RAGTool(Tool):
    def __init__(self, embedding_model="text-embedding-ada-002", vector_dim=1536):
        super().__init__()
        # Initialize OpenAI API for generating embedding
        openai.api_key = os.getenv("OPENAI_API_KEY")  # Ensure the API key is set as an environment variable
        self.embedding_model = embedding_model

        # Initialize FAISS index (for vector search)
        self.index = faiss.IndexFlatL2(vector_dim)  # L2 distance
        self.embeddings = []
        self.documents = []

    def parse_document(self, file_path):
        """Parses PDF or text document to extract content."""
        if file_path.endswith('.pdf'):
            return self._parse_pdf(file_path)
        elif file_path.endswith('.txt'):
            return self._parse_text(file_path)
        else:
            raise ValueError("Unsupported file format. Please provide a PDF or text document.")

    def _parse_pdf(self, pdf_path):
        """Extracts text from a PDF file."""
        with open(pdf_path, 'rb') as f:
            pdf_reader = PyPDF2.PdfReader(f)
            text = ''
            for page_num in range(len(pdf_reader.pages)):
                page = pdf_reader.pages[page_num]
                text += page.extract_text()
        return text

    def _parse_text(self, text_path):
        """Extracts text from a .txt file."""
        with open(text_path, 'r') as file:
            text = file.read()
        return text

    def generate_embeddings(self, text):
        """Generates embeddings using OpenAI's API."""
        response = openai.Embedding.create(
            input=text,
            model=self.embedding_model
        )
        embeddings = response['data'][0]['embedding']
        return np.array(embeddings, dtype=np.float32)

    def store_embeddings(self, document, embeddings):
        """Stores embeddings in FAISS index and maintains a list of documents."""
        self.embeddings.append(embeddings)
        self.documents.append(document)
        self.index.add(np.array([embeddings]))

    def retrieve_similar_documents(self, query):
        """Retrieves the most relevant document using FAISS."""
        query_embedding = self.generate_embeddings(query)
        D, I = self.index.search(np.array([query_embedding]), k=1)
        return self.documents[I[0][0]]

    def answer_query(self, query):
        """Answers a query by retrieving relevant document and using a language model."""
        relevant_document = self.retrieve_similar_documents(query)
        response = openai.Completion.create(
            model="text-davinci-003",
            prompt=f"Based on the following document: {relevant_document}, answer the question: {query}",
            max_tokens=150
        )
        return response['choices'][0]['text']

    def run(self, input_data):
        """Main function to process input data, generate embeddings, store them, and handle queries."""
        print("Parsing document...")
        document_text = self.parse_document(input_data)
        print("Document parsed successfully.")

        print("Generating embeddings...")
        embeddings = self.generate_embeddings(document_text)
        print("Embeddings generated successfully.")

        print("Storing embeddings...")
        self.store_embeddings(document_text, embeddings)
        print("Embeddings stored successfully.")

        # After storing, you can ask any query
        query = input("Enter your query about the document: ")
        answer = self.answer_query(query)
        return answer


if __name__ == "__main__":
    tool = RAGTool()
    file_path = input("Enter the path to your document (PDF or TXT): ")
    try:
        answer = tool.run(file_path)
        print("Answer:", answer)
    except Exception as e:
        print(f"An error occurred: {e}")
