import * as path from 'path';
import * as fs from 'fs';

/**
 * Finds the directory containing the package.json file by traversing up the directory tree.
 * @returns {string | null} The absolute path to the directory containing package.json, or null if not found.
 */
export function getPackageJsonDir(): string | null {
    let currentDir = __dirname;
    
    while (currentDir !== path.parse(currentDir).root) {
        const packageJsonPath = path.join(currentDir, 'package.json');
        
        if (fs.existsSync(packageJsonPath)) {
            return currentDir;
        }
        
        currentDir = path.dirname(currentDir);
    }
    
    return null;
}
