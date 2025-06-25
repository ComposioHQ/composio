import os
import json
import hashlib
from typing import Dict, Any
from enum import Enum
from pydantic import BaseModel, Field

from composio.utils.logging import get as get_logger

from composio.tools.base.local import LocalAction

from composio.tools.local.doc_rag.constants import (
    INDEX_CACHE, INDEX_FILE, DEEPLAKE_FOLDER
)
from composio.tools.local.doc_rag.utils import get_file_hash
from composio.tools.local.doc_rag.processing.chunker import TextChunker
from composio.tools.local.doc_rag.processing.extractor import ExtractorRegistry
from composio.tools.local.doc_rag.processing.embedder import Embedding
from composio.tools.local.doc_rag.storage.storage import DeeplakeVectorStore

logger = get_logger("DocRAG")

class Status(str, Enum):
    NOT_STARTED = "not_started"
    EXTRACTING = "extracting"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    COMPLETED = "completed"
    FAILED = "failed"

class CreateIndexRequest(BaseModel):
    pass

class CreateIndexResponse(BaseModel):
    result: str = Field(
        ...,
        description="Outcome of the inedex creation process, including success or failure status and any relevant details",
    )

class IndexingTracker:
    """
    A simple managr that tracks indexed files and determines whether re indexing is required
    Maintains an index of file paths, their hashes, and processing status. 
    """
    def __init__(self, path: str):
        self.path = path
        self.data: Dict[str, Any] = self._load()

    def _load(self) -> Dict[str, Any]:
        if not os.path.exists(self.path):
            return {"status": Status.NOT_STARTED.value, "files": {}}
        with open(self.path, 'r') as f:
            return json.load(f)

    def _save(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, 'w') as f:
            json.dump(self.data, f, indent=2)
            
    def is_file_changed(self, file_path: str) -> bool:
        if file_path not in self.data['files']:
            return True 
        
        last_hash = self.data['files'][file_path]['hash']
        return get_file_hash(file_path) != last_hash

    def update_file_record(self, file_path: str, status: str):
        self.data['files'][file_path] = {
            "mtime": os.path.getmtime(file_path),
            "hash": get_file_hash(file_path),
            "status": status
        }
        self._save()
        
    def update_status(self, status: Status, error: str = ""):
        self.data['status'] = status.value
        self.data['error'] = error
        self._save()


class CreateIndex(LocalAction[CreateIndexRequest, CreateIndexResponse]):
    display_name = "Create Docs Index"
    _tags = ["index"]
    requires = ["tqdm"]

    def execute(self, request: CreateIndexRequest, metadata: Dict) -> CreateIndexResponse:
        self.path = os.path.normpath(os.path.abspath(metadata["dir_to_index_path"]))
        
        path_hash = hashlib.md5(self.path.encode()).hexdigest()
        self.cache_dir = os.path.join(INDEX_CACHE, path_hash)
        logger.info(f"tmp directory for indexing/vectors: {self.cache_dir}")
        self.manifest = IndexingTracker(os.path.join(self.cache_dir, INDEX_FILE))
        self.vector_store = DeeplakeVectorStore(os.path.join(self.cache_dir, DEEPLAKE_FOLDER))
        self.extractor_registry = ExtractorRegistry()
        self.chunker = TextChunker()
        self.embedding_model = Embedding()
        if self.manifest.data['status'] == Status.COMPLETED.value:
            logger.info(f"index for '{self.path}' is already complete, checking for new updates.")
        
        try:
            files_to_process = self._collect_files()
            if not files_to_process:
                return CreateIndexResponse(result="no new or modified files to index")

            self.manifest.update_status(Status.EXTRACTING)
            
            batch_data = []
            for i, file_path in enumerate(files_to_process, 1):
                logger.info(f"[{i}/{len(files_to_process)}] processing: {file_path}")
                
                extractor = self.extractor_registry.get_extractor(file_path)
                if extractor is not None:
                    text = extractor.extract(file_path)
                else:
                    logger.warning(f"file extraction of {file_path} is not supported rn :(")
                if not text:
                    self.manifest.update_file_record(file_path, "failed_extraction") 
                    continue
                
                self.manifest.update_status(Status.CHUNKING)
                chunks = self.chunker.chunk(text)
                if not chunks:
                    logger.error(f"chunking failed: {file_path}")
                    self.manifest.update_file_record(file_path, "failed_chunking")
                    continue
                
                self.manifest.update_status(Status.EMBEDDING)
                embeddings = self.embedding_model.compute(chunks)
                
                rel_path = os.path.relpath(file_path, self.path)
                for j, chunk_text in enumerate(chunks):
                    batch_data.append({
                        "text": chunk_text,
                        "embedding": embeddings[j],
                        "metadata": {"source": rel_path}
                    })
                
                self.manifest.update_file_record(file_path, "success") 
            
            if batch_data:
                logger.info(f"adding {len(batch_data)} chunks to the store...")
                self.vector_store.add(
                    documents=[d['text'] for d in batch_data],
                    embeddings=[d['embedding'] for d in batch_data],
                    metadatas=[d['metadata'] for d in batch_data]
                )

            self.manifest.update_status(Status.COMPLETED)
            return CreateIndexResponse(result=f"indexing complete")

        except Exception as e:
            self.manifest.update_status(Status.FAILED, str(e))
            raise RuntimeError(f"indexing failed: {e}") from e

    def _collect_files(self) -> list[str]:
        all_files = []
        if os.path.isfile(self.path):
            if self.extractor_registry.get_extractor(self.path):
                all_files.append(self.path)
        # FIXME: call again recusrviely to support recursive directories
        elif os.path.isdir(self.path):
            for root, _, fnames in os.walk(self.path):
                for fname in fnames:
                    if self.extractor_registry.get_extractor(fname):
                        all_files.append(os.path.join(root, fname))
        # filter out unchanged ones
        return [f for f in all_files if self.manifest.is_file_changed(f)]
        