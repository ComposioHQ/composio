import { disableTool } from 'eve/tools';

// Disable the default-harness `bash` tool. The docs assistant answers only from
// the Composio docs via search_docs + read_doc — no web, shell, or sandbox FS.
export default disableTool();
