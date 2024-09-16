import * as path from 'path';
import * as os from 'os';

import * as fs from 'fs';

export const getComposioDir = () => {
    const composioDir = path.join(os.homedir(), '.composio');
    if (!fs.existsSync(composioDir)) {
        fs.mkdirSync(composioDir, { recursive: true });
    }
    return composioDir;
}

export const getComposioFilesDir = () => {
    const composioFilesDir = path.join(os.homedir(), '.composio', 'files');
    if (!fs.existsSync(composioFilesDir)) {
        fs.mkdirSync(composioFilesDir, { recursive: true });
    }
    return composioFilesDir;
}

export const saveFile = (file: string, content: string) => {
    const composioFilesDir = getComposioFilesDir();
    const filePath = `${composioFilesDir}/${file}`;
    fs.writeFileSync(filePath, content);

    return filePath;
}