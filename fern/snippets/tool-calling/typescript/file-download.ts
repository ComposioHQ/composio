import { Composio } from '@composio/core';
const composio = new Composio({apiKey: 'your-composio-api-key'});

// Download a file from Google Drive
const result = await composio.tools.execute('GOOGLEDRIVE_DOWNLOAD_FILE', {
    userId: 'user-1235***',
    arguments: {
      file_id: 'your-file-id'
    }
  });
  
// Result includes local file path
console.log(result);