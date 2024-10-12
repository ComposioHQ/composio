from ..tool import ClipboardTool



def apply_action(text: str):
    clipboard_tool = ClipboardTool()
    clipboard_tool.copy_text(text)
    print(f"Copied text: {text}")
