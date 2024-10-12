from ..tool import ClipboardTool



def apply_action():
    clipboard_tool = ClipboardTool()
    image = clipboard_tool.retrieve_image()
    if image:
        print("Image successfully retrieved.")
    else:
        print("No image found in clipboard.")
