const fs = require('fs');
let content = fs.readFileSync('dist/index.d.ts', 'utf8');
content = content.replace(/type\s+([A-Za-z0-9_]+)\s*=/g, 'export type $1 =');

content = content.replace(/declare\s+class\s+/g, 'export declare class ');
content = content.replace(/declare\s+const\s+/g, 'export declare const ');

content = content.replace("export { ACTIONS, APPS, CloudflareToolSet, Composio, LangGraphToolSet, LangchainToolSet, OpenAIToolSet, VercelAIToolSet, Workspace };", '');
fs.writeFileSync('dist/index.d.ts', content);
