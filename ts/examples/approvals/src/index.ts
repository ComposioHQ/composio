import * as readline from 'node:readline/promises';
import { askForApproval, runWithApprovals } from './approval';
import {
  createApprovalSession,
  createComposio,
  multiArguments,
  tool,
  toolArguments,
} from './session';

const composio = createComposio();
const session = await createApprovalSession(composio);
const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
try {
  const result = await runWithApprovals(
    options =>
      process.argv.includes('--multi')
        ? session.executeMeta('COMPOSIO_MULTI_EXECUTE_TOOL', multiArguments, options)
        : session.execute(tool, toolArguments, options),
    question => askForApproval(question, prompt => terminal.question(prompt))
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  terminal.close();
  await composio.sessions.delete(session.sessionId);
}
