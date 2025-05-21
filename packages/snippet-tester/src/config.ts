import path from "path";

export interface Language {
    name: string;
    exec: (file: string) => string;
    snippetRoot: (base: string) => string;
    glob: string;
}

export const config: {
    languages: Language[];
} = {
    "languages": [
        {
            "name": "node",
            "exec": (file: string) => `node ${file}`,
            "snippetRoot": (base: string) => path.join(base, "./snippets/node"),
            "glob": "**/*.js"
        },
        {
            "name": "java",
            "exec": (file: string) => {
                const classPath = file.replace("app/src/main/java/", "").replace(".java", "").split("/").join(".");
                
                return `gradle -PmainClass=${classPath} run`
            },
            "snippetRoot": (base: string) => path.join(base, "./snippets/java"),
            "glob": "./app/src/main/java/**/*.java"
        },
        {
            "name": "python",
            "exec": (file: string) => `poetry run python ${file}`,
            "snippetRoot": (base: string) => path.join(base, "./snippets/python"),
            "glob": "**/*.py"   
        },
        {
            "name": "golang",
            "exec": (file: string) => `go run ${file}`,
            "snippetRoot": (base: string) => path.join(base, "./snippets/go"),
            "glob": "**/*.go"
        }
    ]
}