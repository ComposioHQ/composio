const fs = require('fs');
let content = fs.readFileSync('dist/index.d.ts', 'utf8');
content = content.replace(/type\s+([A-Za-z0-9_]+)\s*=/g, 'export type $1 =');
content = content.replace(/interface\s+([A-Za-z0-9_]+)\s*=/g, 'export interface $1 =');
fs.writeFileSync('dist/index.d.ts', content);
