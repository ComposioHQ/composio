import os
# Disable remote enum fetching
os.environ["COMPOSIO_NO_REMOTE_ENUM_FETCHING"] = "true"

from composio.client.enums.base import add_runtime_action, ActionData
from composio.tools.local.clipboardtool.actions.files import CopyFilePaths, PasteFilePaths
from composio.tools.local.clipboardtool.actions.image import CopyImage, PasteImage
from composio.tools.local.clipboardtool.actions.text import CopyText, PasteText
from composio.tools.local.clipboardtool.tool import Clipboardtool
from composio.tools.base.abs import action_registry

def register_clipboard_actions():
    """Register clipboard actions in the Action enum."""
    actions = [
        (CopyText, "Copy text to clipboard"),
        (PasteText, "Paste text from clipboard"),
        (CopyImage, "Copy image to clipboard"),
        (PasteImage, "Paste image from clipboard"),
        (CopyFilePaths, "Copy file paths to clipboard"),
        (PasteFilePaths, "Paste file paths from clipboard"),
    ]
    
    for action, _ in actions:
        add_runtime_action(
            f"CLIPBOARDTOOL_{action.__name__.upper()}",
            ActionData(
                name=action.__name__,
                app="CLIPBOARDTOOL",
                tags=[],
                no_auth=True,
                is_local=True,
                is_runtime=True,
            )
        )

# Register actions before importing Action
register_clipboard_actions()

from composio import Action, ComposioToolSet
from PIL import Image
import os
import tempfile

def main():
    # Load clipboard tool to register actions
    tool = Clipboardtool()
    # Register actions
    tool.register()
    actions = tool.actions()
    
    # Register actions in action registry
    for action in actions:
        action_registry["runtime"][f"CLIPBOARDTOOL_{action.__name__.upper()}"] = action()
    
    # Initialize the toolset
    toolset = ComposioToolSet()
    
    # Initialize clipboard state
    clipboard_state = {}
    
    # Example 1: Text Copy/Paste
    print("\n=== Text Copy/Paste Example ===")
    test_text = "Hello from Composio Clipboard Tool!"
    
    # Copy text
    copy_response = toolset.execute_action(
        action=Action.CLIPBOARDTOOL_COPY_TEXT,
        params={"text": test_text},
        metadata={"clipboard_state": clipboard_state}
    )
    print("Copy text response:", copy_response)
    assert not copy_response.get("error")
    
    # Paste text
    paste_response = toolset.execute_action(
        action=Action.CLIPBOARDTOOL_PASTE_TEXT,
        params={},
        metadata={"clipboard_state": clipboard_state}
    )
    print("Paste text response:", paste_response)
    assert not paste_response.get("error")
    assert paste_response["data"]["text"] == test_text
    
    # Example 2: Image Copy/Paste
    print("\n=== Image Copy/Paste Example ===")
    with tempfile.TemporaryDirectory() as temp_dir:
        print(f"Using temp directory: {temp_dir}")
        
        # Create a test image instead of using a hard-coded path
        test_image_path = os.path.join(temp_dir, "test_image.png")
        # Create a simple test image
        test_image = Image.new('RGB', (100, 100), color='red')
        test_image.save(test_image_path)
        
        print(f"Using image from: {test_image_path}")
        
        # Ensure the image file exists
        print(f"Checking if image exists at: {test_image_path}")
        print(f"File exists: {os.path.exists(test_image_path)}")
        print(f"File size: {os.path.getsize(test_image_path) if os.path.exists(test_image_path) else 'N/A'}")
        assert os.path.exists(test_image_path), f"Image not found at {test_image_path}"
        
        # Copy image
        copy_response = toolset.execute_action(
            action=Action.CLIPBOARDTOOL_COPY_IMAGE,
            params={"image_path": test_image_path},
            metadata={"clipboard_state": clipboard_state}
        )
        print("Copy image response:", copy_response)
        assert not copy_response.get("error")
        
        # Paste image
        paste_path = os.path.join(temp_dir, "pasted.png")
        print(f"Pasting image to: {paste_path}")
        paste_response = toolset.execute_action(
            action=Action.CLIPBOARDTOOL_PASTE_IMAGE,
            params={"save_path": paste_path},
            metadata={"clipboard_state": clipboard_state}
        )
        print("Paste image response:", paste_response)
        assert not paste_response.get("error")
        assert paste_response["data"]["image_path"] == paste_path
        assert os.path.exists(paste_path)
        
        # Verify pasted image
        pasted_image = Image.open(paste_path)
        print(f"Pasted image size: {pasted_image.size}")
        print(f"Pasted image mode: {pasted_image.mode}")
    
    # Example 3: File Paths Copy/Paste
    print("\n=== File Paths Copy/Paste Example ===")
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create test files
        test_files = []
        for i in range(3):
            file_path = os.path.join(temp_dir, f"test{i}.txt")
            with open(file_path, "w") as f:
                f.write(f"Test content {i}")
            test_files.append(file_path)
        
        # Copy file paths
        copy_response = toolset.execute_action(
            action=Action.CLIPBOARDTOOL_COPY_FILE_PATHS,
            params={"paths": test_files},
            metadata={"clipboard_state": clipboard_state}
        )
        print("Copy file paths response:", copy_response)
        assert not copy_response.get("error")
        
        # Paste file paths
        paste_response = toolset.execute_action(
            action=Action.CLIPBOARDTOOL_PASTE_FILE_PATHS,
            params={},
            metadata={"clipboard_state": clipboard_state}
        )
        print("Paste file paths response:", paste_response)
        assert not paste_response.get("error")
        assert paste_response["data"]["paths"] == test_files

if __name__ == "__main__":
    main() 
