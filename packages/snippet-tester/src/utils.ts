import * as childProcess from "child_process"
import fs from "fs"

export const findAndReplace = async (paths: string[], find: RegExp, replace: string) => {
    await Promise.all(paths.map(async (path) => {
        const file = await fs.promises.readFile(path)
        const content = file.toString()
        const newContent = content.replace(find, replace)
        await fs.promises.writeFile(path, newContent)
    }))
}

export const execCmd = async (cmd: string, cwd: string): Promise<{error: null | childProcess.ExecException, stderr: string, stdout: string}> => {
    return new Promise((resolve, reject) => {
        try {
            childProcess.exec(cmd, {cwd}, (error, stdout, stderr) => {
                if (error) {
                    resolve({error, stderr, stdout})
                }
                resolve({ error, stderr, stdout})
            })
        } catch (error) {
            resolve({error, stderr: '', stdout: ''})
        }
    })
}

export const getFilesByExtension = async (base: string, extension: string): Promise<string[]> => {
    const list = await fs.promises.readdir(base)
    const all = await Promise.all(list.flatMap((file) => {
        const filepath = `${base}/${file}`

        if (fs.statSync(filepath).isDirectory()) {
            return getFilesByExtension(filepath, extension)
        } else if (file.endsWith(extension)) {
            return filepath
        }

        return []
    }))

    return all.flat()
}

export const execTypescriptFile = async (projectRoot: string, file: string) => {
    const cmd = `npx ts-node ${file}`
    return execCmd(cmd, projectRoot)
}

export const execJavaFile = async (projectRoot: string, file: string) => {
    const cmd = `java ${file}`
    return execCmd(cmd, projectRoot)
}

export const execPythonFile = async (projectRoot: string, file: string) => {
    const cmd = `python ${file}`
    return execCmd(cmd, projectRoot)
}

export const execGoFile = async (projectRoot: string, file: string) => {
    const cmd = `go run ${file}`
    return execCmd(cmd, projectRoot)
}
