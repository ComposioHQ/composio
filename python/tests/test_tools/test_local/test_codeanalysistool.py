import json

from composio.tools.local.codeanalysis.actions.create_codemap import (
    CreateCodeMap,
    CreateCodeMapRequest,
)
from composio.tools.local.codeanalysis.actions.get_class_info import (
    GetClassInfo,
    GetClassInfoRequest,
)
from composio.tools.local.codeanalysis.actions.get_method_body import (
    GetMethodBody,
    GetMethodBodyRequest,
)
from composio.tools.local.codeanalysis.actions.get_method_signature import (
    GetMethodSignature,
    GetMethodSignatureRequest,
)
from composio.tools.local.codeanalysis.actions.get_relevant_code import (
    GetRelevantCode,
    GetRelevantCodeRequest,
)

from tests.conftest import ROOT_DIR


class TestCodeAnalysisTool:
    repo_path = ROOT_DIR / "composio/cli/"

    @classmethod
    def setup_class(cls):
        create_codemap = CreateCodeMap()
        response = create_codemap.execute(
            CreateCodeMapRequest(), metadata={"dir_to_index_path": cls.repo_path}
        )
        assert "Indexing completed" in str(
            response.result
        ) or "Indexing already exists" in str(response.result)

    def test_create_codemap(self):
        with (self.repo_path / ".indexing_status.json").open("r") as f:
            status = json.load(f)
            assert status["status"] == "completed"

    def test_get_class_info(self):
        get_class_info = GetClassInfo()
        response = get_class_info.execute(
            GetClassInfoRequest(class_name="UpdateExamples"),
            metadata={"dir_to_index_path": self.repo_path},
        )
        assert "UpdateExamples" in str(response.result)
        assert "apps.py" in str(response.result)

        response = get_class_info.execute(
            GetClassInfoRequest(class_name="SomeRandomClass"),
            metadata={"dir_to_index_path": self.repo_path},
        )
        assert "No matching" in str(response.result)

    def test_get_method_signature(self):
        get_method_signature = GetMethodSignature()
        response = get_method_signature.execute(
            GetMethodSignatureRequest(method_name="_update_apps"),
            metadata={"dir_to_index_path": self.repo_path},
        )
        assert "_update_apps" in str(response.result)
        assert "apps.py" in str(response.result)
        assert "Not a member of any class" in str(response.result)

        response = get_method_signature.execute(
            GetMethodSignatureRequest(
                class_name="HelpfulCmdBase", method_name="format_help_text"
            ),
            metadata={"dir_to_index_path": self.repo_path},
        )
        assert "HelpfulCmdBase" in str(response.result)
        assert "helpfulcmd.py" in str(response.result)
        assert "format_help_text" in str(response.result)

        response = get_method_signature.execute(
            GetMethodSignatureRequest(
                class_name="SomeRandomClass", method_name="format_help_text"
            ),
            metadata={"dir_to_index_path": self.repo_path},
        )
        assert "No matching methods found" in str(response.result)

        response = get_method_signature.execute(
            GetMethodSignatureRequest(
                class_name="SomeRandomClass", method_name="some_random_method"
            ),
            metadata={"dir_to_index_path": self.repo_path},
        )
        assert "No matching methods found" in str(response.result)

    def test_get_method_body(self):
        get_method_body = GetMethodBody()
        response = get_method_body.execute(
            GetMethodBodyRequest(method_name="_update_apps"),
            metadata={"dir_to_index_path": self.repo_path},
        )
        assert "```python" in str(response.result)
        assert "_update_apps" in str(response.result)

        response = get_method_body.execute(
            GetMethodBodyRequest(
                class_name="HelpfulCmdBase", method_name="format_help_text"
            ),
            metadata={"dir_to_index_path": self.repo_path},
        )
        assert "```python" in str(response.result)
        assert "format_help_text" in str(response.result)

        response = get_method_body.execute(
            GetMethodBodyRequest(
                class_name="SomeRandomClass", method_name="format_help_text"
            ),
            metadata={"dir_to_index_path": self.repo_path},
        )
        assert "No matching methods found" in str(response.result)

        response = get_method_body.execute(
            GetMethodBodyRequest(
                class_name="SomeRandomClass", method_name="some_random_method"
            ),
            metadata={"dir_to_index_path": self.repo_path},
        )
        assert "No matching methods found" in str(response.result)

    def test_get_relevant_code(self):
        get_relevant_code = GetRelevantCode()
        response = get_relevant_code.execute(
            GetRelevantCodeRequest(query="How to update apps?"),
            metadata={"dir_to_index_path": self.repo_path},
        )
        assert "How to update apps?" in str(response.result)
        assert "Chunk" in str(response.result)
