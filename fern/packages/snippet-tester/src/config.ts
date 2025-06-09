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
            "name": "typescript",
            "exec": (file: string) => `bun run ${file}`,
            "snippetRoot": (base: string) => path.join(base, "./snippets/typescript"),
            "glob": "**/*.ts"
        },
        {
            "name": "python",
            "exec": (file: string) => `poetry run python ${file}`,
            "snippetRoot": (base: string) => path.join(base, "./snippets/python"),
            "glob": "**/*.py"   
        },
    ]
}