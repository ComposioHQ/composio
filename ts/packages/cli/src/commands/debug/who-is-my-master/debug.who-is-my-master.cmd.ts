import { Command } from 'effect/cli';
import { runDebugWhoIsMyMaster } from './debug.who-is-my-master.handler';

export const debugCmd$WhoIsMyMaster = Command.make(
  'who-is-my-master',
  {},
  runDebugWhoIsMyMaster
).pipe(Command.unlisted);
