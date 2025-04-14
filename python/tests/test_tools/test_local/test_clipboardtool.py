# pylint: disable=protected-access,no-member,unsupported-membership-test,unspecified-encoding,not-an-iterable,unsubscriptable-object,unused-argument
import os
import tempfile

import pytest
from PIL import Image

from composio import Action
from composio.tools.env.factory import WorkspaceType
from composio.tools.local.clipboardtool.actions.files import (
    CopyFilePaths,
    CopyFilePathsRequest,
    PasteFilePaths,
    PasteFilePathsRequest,
)
from composio.tools.local.clipboardtool.actions.image import (
    CopyImage,
    CopyImageRequest,
    PasteImage,
    PasteImageRequest,
)
from composio.tools.local.clipboardtool.actions.text import (
    CopyText,
    CopyTextRequest,
    PasteText,
    PasteTextRequest,
)
from composio.tools.local.clipboardtool.tool import Clipboardtool
from composio.tools.toolset import ComposioToolSet

from tests.conftest import skip_if_ci


# Disable remote enum fetching for tests
os.environ["COMPOSIO_NO_REMOTE_ENUM_FETCHING"] = "true"


@pytest.fixture(scope="module")
def temp_dir():
    with tempfile.TemporaryDirectory() as tmpdirname:
        yield tmpdirname


@pytest.fixture(scope="module")
def clipboard_state():
    """Shared clipboard state for tests."""
    from composio.tools.local.clipboardtool.actions.base_action import ClipboardState

    return {"clipboard_state": ClipboardState()}


@pytest.mark.usefixtures("temp_dir")
class TestClipboardtool:
    def test_text_copy_and_paste(self, clipboard_state):
        """Test copying and pasting text."""
        # Copy text
        copy_action = CopyText()
        test_text = "Hello, World!"
        copy_response = copy_action.execute(
            CopyTextRequest(text=test_text), clipboard_state
        )
        assert not copy_response.error

        # Paste text
        paste_action = PasteText()
        paste_response = paste_action.execute(PasteTextRequest(), clipboard_state)
        assert not paste_response.error
        assert paste_response.text == test_text

    def test_image_copy_and_paste(self, temp_dir, clipboard_state):
        """Test copying and pasting an image."""
        # Create a test image
        test_image = Image.new("RGB", (100, 100), color="red")
        test_image_path = os.path.join(temp_dir, "test.png")
        test_image.save(test_image_path)

        # Copy image
        copy_action = CopyImage()
        copy_response = copy_action.execute(
            CopyImageRequest(image_path=test_image_path), clipboard_state
        )
        assert not copy_response.error

        # Paste image
        paste_action = PasteImage()
        paste_path = os.path.join(temp_dir, "pasted.png")
        paste_response = paste_action.execute(
            PasteImageRequest(save_path=paste_path), clipboard_state
        )
        assert not paste_response.error
        assert paste_response.image_path == paste_path
        assert os.path.exists(paste_path)

        # Verify pasted image
        pasted_image = Image.open(paste_path)
        assert pasted_image.size == (100, 100)
        assert pasted_image.getpixel((0, 0)) == (255, 0, 0)  # Red color

        # Cleanup
        pasted_image.close()
        os.remove(paste_path)

    def test_file_paths_copy_and_paste(self, temp_dir, clipboard_state):
        """Test copying and pasting file paths."""
        # Create test files
        test_files = []
        for i in range(3):
            file_path = os.path.join(temp_dir, f"test{i}.txt")
            with open(file_path, "w") as f:
                f.write(f"Test content {i}")
            test_files.append(file_path)

        # Copy file paths
        copy_action = CopyFilePaths()
        copy_response = copy_action.execute(
            CopyFilePathsRequest(paths=test_files), clipboard_state
        )
        assert not copy_response.error

        # Paste file paths
        paste_action = PasteFilePaths()
        paste_response = paste_action.execute(PasteFilePathsRequest(), clipboard_state)
        assert not paste_response.error
        assert paste_response.paths == test_files

        # Cleanup
        for file_path in test_files:
            os.remove(file_path)

    @skip_if_ci(reason="Timeout")
    def test_clipboardtool_with_toolset(self, temp_dir, clipboard_state):
        """Test clipboard tool with toolset."""
        # Load clipboard tool to register actions
        tool = Clipboardtool()
        # Register actions
        tool.register()
        actions = tool.actions()

        # Register actions in action registry
        from composio.tools.base.abs import action_registry

        for action in actions:
            action_registry["runtime"][
                f"CLIPBOARDTOOL_{action.__name__.upper()}"
            ] = action()

        toolset = ComposioToolSet(workspace_config=WorkspaceType.Host())

        # Test text copy/paste
        test_text = "Hello, World!"
        copy_response = toolset.execute_action(
            Action.CLIPBOARDTOOL_COPY_TEXT,
            {"text": test_text},
            metadata={"clipboard_state": clipboard_state},
        )
        assert not copy_response.get("error")

        paste_response = toolset.execute_action(
            Action.CLIPBOARDTOOL_PASTE_TEXT,
            {},
            metadata={"clipboard_state": clipboard_state},
        )
        assert not paste_response.get("error")
        assert paste_response["data"]["text"] == test_text

        # Test image copy/paste
        test_image = Image.new("RGB", (100, 100), color="red")
        test_image_path = os.path.join(temp_dir, "test.png")
        test_image.save(test_image_path)

        copy_response = toolset.execute_action(
            Action.CLIPBOARDTOOL_COPY_IMAGE,
            {"image_path": test_image_path},
            metadata={"clipboard_state": clipboard_state},
        )
        assert not copy_response.get("error")

        paste_path = os.path.join(temp_dir, "pasted.png")
        paste_response = toolset.execute_action(
            Action.CLIPBOARDTOOL_PASTE_IMAGE,
            {"save_path": paste_path},
            metadata={"clipboard_state": clipboard_state},
        )
        assert not paste_response.get("error")
        assert paste_response["data"]["image_path"] == paste_path
        assert os.path.exists(paste_path)

        # Cleanup image files
        test_image.close()
        os.remove(test_image_path)
        os.remove(paste_path)

        # Test file paths copy/paste
        test_files = []
        for i in range(3):
            file_path = os.path.join(temp_dir, f"test{i}.txt")
            with open(file_path, "w") as f:
                f.write(f"Test content {i}")
            test_files.append(file_path)

        copy_response = toolset.execute_action(
            Action.CLIPBOARDTOOL_COPY_FILE_PATHS,
            {"paths": test_files},
            metadata={"clipboard_state": clipboard_state},
        )
        assert not copy_response.get("error")

        paste_response = toolset.execute_action(
            Action.CLIPBOARDTOOL_PASTE_FILE_PATHS,
            {},
            metadata={"clipboard_state": clipboard_state},
        )
        assert not paste_response.get("error")
        assert paste_response["data"]["paths"] == test_files

        # Cleanup test files
        for file_path in test_files:
            os.remove(file_path)
