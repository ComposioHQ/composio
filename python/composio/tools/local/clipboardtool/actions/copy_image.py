from ..tool import ClipboardTool



def apply_action(image_path: str):
    clipboard_tool = ClipboardTool()
    try:
        clipboard_tool.copy_image(image_path)
    except Exception as e:
        print(f"Error: {str(e)}")
