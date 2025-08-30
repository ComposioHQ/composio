import type { Tools } from 'src/models/tools';
import TOOLS from './tools.json' with { type: 'json' };

// Work around TypeScript's "The inferred type of this node exceeds the maximum length the compiler will serialize. An explicit type annotation is needed. ts(7056)" error.
export const TOOLS_TYPES_GOOGLEDRIVE = (TOOLS as Tools).filter(tool =>
  tool.slug.startsWith('GOOGLEDRIVE_')
);
