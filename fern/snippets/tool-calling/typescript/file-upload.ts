import { Composio } from '@composio/core';
import path from 'path';

const composio = new Composio({
  apiKey: 'your-composio-api-key'
});

// Upload a local file to Google Drive
const result = await composio.tools.execute('GOOGLEDRIVE_UPLOAD_FILE', {
  userId: 'user-4235***',
  arguments: {
    file_to_upload: path.join(__dirname, 'document.pdf')  // Local file path
  }
});

console.log(result.data);  // Contains Google Drive file details
