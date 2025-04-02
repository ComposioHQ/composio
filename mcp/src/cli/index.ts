process.env.YARGS_MIN_NODE_VERSION = '10';
require('event-target-polyfill');
if (!global.AbortController) {
  const { AbortController, abortableFetch } = require('abortcontroller-polyfill/dist/cjs-ponyfill');

  global.AbortController = AbortController;
}
if (!(global as any).abortableFetch) {
  const { AbortController, abortableFetch } = require('abortcontroller-polyfill/dist/cjs-ponyfill');

  (global as any).abortableFetch = abortableFetch;
}
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import mcpCommand from './commands/setup';
import startCommand from './commands/start';

const nodeVersion = process.version;

yargs(hideBin(process.argv))
  .command(mcpCommand)
  .command(startCommand)
  .demandCommand(1, 'You need to specify a command')
  .strict()
  .alias('h', 'help')
  .alias('v', 'version')
  .parse();
