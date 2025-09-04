import os

from composio import Composio

composio = Composio(api_key="your_composio_key")

# Upload a local file to Google Drive
result = composio.tools.execute(
    slug="GOOGLEDRIVE_UPLOAD_FILE",
    user_id="user-1235***",
    arguments={"file_to_upload": os.path.join(os.getcwd(), "document.pdf")},  # Local file path
)

print(result)  # Print Google Drive file details
