import { describe, expect, test } from 'bun:test';
import * as fs from "fs";
import { glob } from "glob";
import path from 'path';
import { config, Language } from '../config';
import { execCmd } from '../utils';

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

const workspaceDir = findPnpmWorkspaceDir()

describe.each(config.languages.map(o => [o.name, o] as [string, Language]))("Testing language %s", (name: string, lang: Language) => {
    const cwd = lang.snippetRoot(workspaceDir)
    const filePaths = glob.globSync(lang.glob, { cwd })

    test.each(filePaths)('testing file %s', async (filePath: string) => {
        const { error } = await execCmd(lang.exec(filePath), cwd)

        expect(error).toMatchSnapshot()
    }, { timeout: 1000000 });
})