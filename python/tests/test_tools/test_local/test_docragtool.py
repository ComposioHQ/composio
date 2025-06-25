from composio.tools.local.doc_rag.actions.create_index import (
    CreateIndex,
    CreateIndexRequest
)

from pathlib import Path


class TestDocRAGTool:
    dir_path = Path(__file__).resolve().parent  # Get current file's directory
    file_path = dir_path.parent / "assets" / "llm.txt"
    print(file_path)
    @classmethod
    def setup_class(cls):
        create_index = CreateIndex()
        response = create_index.execute(
            CreateIndexRequest(), metadata={"dir_to_index_path": cls.file_path}
        )
        assert "indexing complete" in str(
            response.result
        ) or "no new or modified files to index" in str(response.result)