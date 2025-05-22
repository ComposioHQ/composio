import { config } from './config';
import { execCmd, getFilesByExtension } from './utils';
import * as fs from 'fs';
import { glob } from 'glob';
import path from 'path';

// recurse up until you find a pnpm-workspace.yaml  
const findPnpmWorkspaceDir = (curDir = __dirname) => {
    if (curDir === "/") {
        throw new Error("Could not find pnpm-workspace.yaml")
    }

    if (fs.existsSync(path.resolve(curDir, "pnpm-lock.yaml"))) {
        return curDir
    }

    return findPnpmWorkspaceDir(fs.realpathSync(path.resolve(curDir, "..")))
}

const main = async () => {
    const workspaceDir = findPnpmWorkspaceDir();
    
    console.log("Testing snippets in workspace directory:", workspaceDir);
    
    for (const lang of config.languages) {
        console.log(`\nTesting ${lang.name} snippets...`);
        const cwd = lang.snippetRoot(workspaceDir);
        
        try {
            const filePaths = glob.globSync(lang.glob, { cwd });
            
            if (filePaths.length === 0) {
                console.log(`No ${lang.name} snippets found.`);
                continue;
            }
            
            console.log(`Found ${filePaths.length} ${lang.name} snippet(s).`);
            
            for (const filePath of filePaths) {
                console.log(`\nTesting: ${filePath}`);
                const { error, stderr, stdout } = await execCmd(lang.exec(filePath), cwd);
                
                if (error) {
                    console.error(`❌ Error running ${filePath}:`);
                    console.error(stderr || error.message);
                } else {
                    console.log(`✅ Success: ${filePath}`);
                    if (stdout) {
                        console.log("Output:", stdout);
                    }
                }
            }
        } catch (err) {
            console.error(`Error processing ${lang.name} snippets:`, err);
        }
    }
};

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});