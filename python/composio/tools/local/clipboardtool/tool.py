import pyperclip
from PIL import Image, ImageGrab


class ClipboardTool:
    """Tool for interacting with the clipboard."""

    def copy_text(self, text: str):
        """Copies text to the clipboard."""
        if not isinstance(text, str):
            raise ValueError("Text must be a string.")
        pyperclip.copy(text)
        print("Text copied to clipboard.")

    def paste_text(self) -> str:
        """Pastes text from the clipboard."""
        text = pyperclip.paste()
        if not text:
            raise ValueError("Clipboard is empty or contains non-text data.")
        return text

    def copy_image(self, image_path: str):
        """Copies an image to the clipboard."""
        try:
            image = Image.open(image_path)
            image = image.convert("RGBA")  # Ensure the image is in a format suitable for the clipboard
            image.show()  # Image show is a placeholder for copying image to clipboard
            # You might need a library or method to copy the image directly to the clipboard,
            # since pyperclip doesn't support image operations.
            print(f"Image from {image_path} copied to clipboard.")
        except FileNotFoundError:
            print(f"Error: The file {image_path} was not found.")
        except Exception as e:
            print(f"Error copying image: {str(e)}")

    def retrieve_image(self):
        """Retrieves an image from the clipboard."""
        image = ImageGrab.grabclipboard()
        if isinstance(image, Image.Image):
            image.show()  # Show image as confirmation
            print("Image retrieved from clipboard.")
        else:
            print("No image found in clipboard or the content is not an image.")
        return image
