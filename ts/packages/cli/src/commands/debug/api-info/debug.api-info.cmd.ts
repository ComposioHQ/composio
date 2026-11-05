import { Command } from 'effect/cli';
import { runDebugApiInfo } from './debug.api-info.handler';

export const debugCmd$ApiInfo = Command.make('api-info', {}, runDebugApiInfo).pipe(
  Command.unlisted
);
