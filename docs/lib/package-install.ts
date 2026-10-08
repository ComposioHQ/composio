export const PACKAGE_MANAGERS = {
  node: [
    { id: 'npm', install: 'npm install' },
    { id: 'pnpm', install: 'pnpm add' },
    { id: 'bun', install: 'bun add' },
    { id: 'yarn', install: 'yarn add' },
  ],
  python: [
    { id: 'uv', install: 'uv add' },
    { id: 'pip', install: 'pip install' },
  ],
} as const;
