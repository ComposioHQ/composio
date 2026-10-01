import { Array as Arr } from 'effect';
import { RUN_KNOWN_BOOLEAN_FLAGS, RUN_KNOWN_VALUE_FLAGS } from './run.cmd';

const rootCommandIndex = (args: ReadonlyArray<string>) => {
  let index = 0;
  while (index < args.length && args[index].startsWith('-')) {
    if (args[index] === '--') return index;
    if (args[index] === '--log-level') index += 2;
    else index += 1;
  }
  return index;
};

export const normalizeListenStreamFlag = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const head = Arr.take(argv, 2);
  const args = Arr.drop(argv, 2);
  const isListen = args[rootCommandIndex(args)] === 'listen';
  if (!isListen) {
    return argv;
  }

  // Effect string flags require a value. An empty path means stream the whole payload.
  return Arr.appendAll(
    head,
    Arr.flatMap(args, (token, index) => {
      const next = args[index + 1];
      return token === '--stream' && (next === undefined || next.startsWith('-'))
        ? ['--stream', '']
        : [token];
    })
  );
};

// Effect cannot forward subcommand operands after `--`. Keep the script tail outside
// parsing and provide it as RunPassthroughArgs, including flag-looking script arguments.
type RunPassthroughSplit = {
  readonly argv: ReadonlyArray<string>;
  readonly tail: ReadonlyArray<string> | undefined;
};

export const splitRunPassthroughArgs = (argv: ReadonlyArray<string>): RunPassthroughSplit => {
  const args = Arr.drop(argv, 2);
  const commandIndex = rootCommandIndex(args);
  if (args[commandIndex] !== 'run') {
    return { argv, tail: undefined };
  }

  const normalized: Array<string> = [];
  const tail: Array<string> = [];
  let sawPositional = false;
  let droppedSeparator = false;
  let index = commandIndex + 1;
  while (index < args.length) {
    const token = args[index];
    if (!sawPositional) {
      // A `--flag=value` token must be recognized by its name, not the whole
      // token: `--file=script.ts` is a `run` option, and treating it as the
      // first positional would demote every later flag (including safety
      // flags like `--dry-run`) to the passthrough tail.
      const equalsIndex = token.indexOf('=');
      const flagName = equalsIndex === -1 ? token : token.slice(0, equalsIndex);
      if (RUN_KNOWN_VALUE_FLAGS.has(flagName)) {
        normalized.push(token);
        if (equalsIndex === -1) {
          const value = args[index + 1];
          if (value !== undefined) {
            normalized.push(value);
          }
          index += 2;
          continue;
        }
        index += 1;
        continue;
      }
      if (RUN_KNOWN_BOOLEAN_FLAGS.has(flagName)) {
        normalized.push(token);
        index += 1;
        continue;
      }
      // First token that isn't a `run`-recognized flag: everything from here
      // on is the passthrough tail, not a `run` option. A literal `--` here
      // is just the (now unnecessary) boundary marker itself.
      sawPositional = true;
      if (token === '--') {
        droppedSeparator = true;
      } else {
        tail.push(token);
      }
      index += 1;
      continue;
    }
    if (token === '--') {
      // Only the first `--` is the run/script boundary; later ones are script
      // arguments and must reach the script verbatim (matches v3's
      // forwarding behavior).
      if (!droppedSeparator) {
        droppedSeparator = true;
        index += 1;
        continue;
      }
      tail.push('--');
      index += 1;
      continue;
    }
    tail.push(token);
    index += 1;
  }

  return { argv: [...Arr.take(argv, 2 + commandIndex), 'run', ...normalized], tail };
};
