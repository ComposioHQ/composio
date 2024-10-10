from ..tool import ClipboardTool



def apply_action():
    clipboard_tool = ClipboardTool()
    try:
        text = clipboard_tool.paste_text()
        print(f"Pasted text: {text}")
        return text
    except ValueError as e:
        print(f"Error: {str(e)}")
