from composio import Composio


composio = Composio(
    api_key="your_composio_key", file_download_dir="./downloads"
)  # Optional: Specify the directory to download files to

result = composio.tools.execute(
    "GOOGLEDRIVE_DOWNLOAD_FILE",
    user_id="user-1235***",
    arguments={"file_id": "your_file_id"},
)

# Result includes local file path
print(result)
