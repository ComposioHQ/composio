import streamlit as st
import pdfplumber
from sentence_transformers import SentenceTransformer
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import faiss
from composio.tools.local import LocalTool

class PDFEmbeddingQA(LocalTool):
    def __init__(self):
        super().__init__()
        self.model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
        self.index = None
        self.embeddings = []
        self.sentences = []

    def run(self, pdf_file, question):
        if pdf_file:
            self.process_pdf(pdf_file)
            return self.get_answer(question)
        return None

    def process_pdf(self, file):
        text = self.extract_text(file)
        self.sentences = self.split_text(text)
        self.embeddings = self.generate_embeddings(self.sentences)
        self.index = self.build_faiss_index(self.embeddings)

    def extract_text(self, file):
        with pdfplumber.open(file) as pdf:
            return "\n".join([page.extract_text() for page in pdf.pages])

    def split_text(self, text, max_length=512):
        sentences = text.split('\n')
        chunks = []
        current_chunk = []
        current_length = 0

        for sentence in sentences:
            sentence_length = len(sentence.split())
            if current_length + sentence_length > max_length:
                chunks.append(" ".join(current_chunk))
                current_chunk = []
                current_length = 0
            current_chunk.append(sentence)
            current_length += sentence_length

        if current_chunk:
            chunks.append(" ".join(current_chunk))
        return chunks

    def generate_embeddings(self, sentences):
        return self.model.encode(sentences)

    def build_faiss_index(self, embeddings):
        d = embeddings[0].shape[0] 
        index = faiss.IndexFlatL2(d)
        index.add(np.array(embeddings))
        return index

    def get_answer(self, question):
        question_embedding = self.model.encode([question])
        best_match_idx = self.find_best_match(question_embedding)
        return self.sentences[best_match_idx]

    def find_best_match(self, question_embedding):
        D, I = self.index.search(np.array(question_embedding), 1)
        return I[0][0] 

qa_tool = PDFEmbeddingQA()

st.title("RAG Tool")

uploaded_file = st.file_uploader("Upload a PDF file", type="pdf")

if uploaded_file is not None:
    with st.spinner("Processing the PDF..."):
        qa_tool.process_pdf(uploaded_file)
    st.success("PDF processed! You can now ask questions based on the PDF content.")

    user_question = st.text_input("Ask a question about the content of the PDF:")

    if user_question:
        with st.spinner("Searching for the answer..."):
            answer = qa_tool.run(uploaded_file, user_question)
        st.write(f"**Answer:** {answer}")
