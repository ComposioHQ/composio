import { Array as Arr } from 'effect';
import { RUN_FILE_FLAGS, RUN_KNOWN_BOOLEAN_FLAGS, RUN_KNOWN_VALUE_FLAGS } from './run.cmd';
import { rootCommandIndex } from 'src/utils/cli-args';

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

// A token shaped like a lone option (`--name`, `--name=value`, `-n`), as opposed to source code.
const FLAG_SHAPED_TOKEN = /^--?[A-Za-z][A-Za-z0-9_-]*(=|$)/;

// Preserve the legacy undelimited script syntax by inserting Effect's native `--`
// before the script tail. The framework then parses every operand itself.
//
// Without `--file` the first operand is inline source. An unknown option in that position is
// left ahead of the boundary so the framework rejects it by name instead of running it as code.
// Source that really starts that way needs an explicit `--`.
export const normalizeRunScriptArgs = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const commandIndex = 2 + rootCommandIndex(argv.slice(2));
  if (argv[commandIndex] !== 'run') return argv;

  let index = commandIndex + 1;
  let hasFile = false;
  while (index < argv.length) {
    const token = argv[index];
    const equalsIndex = token.indexOf('=');
    const flagName = equalsIndex === -1 ? token : token.slice(0, equalsIndex);
    if (RUN_KNOWN_VALUE_FLAGS.has(flagName)) {
      hasFile ||= RUN_FILE_FLAGS.has(flagName);
      index += equalsIndex === -1 ? 2 : 1;
    } else if (RUN_KNOWN_BOOLEAN_FLAGS.has(flagName)) {
      index += 1;
    } else {
      break;
    }
  }
  if (index >= argv.length) return argv;
  if (!hasFile && FLAG_SHAPED_TOKEN.test(argv[index])) return argv;

  const tail = argv.slice(index);
  // The first user delimiter marks the script boundary; subsequent delimiters
  // are script arguments. Move that boundary ahead of all script operands.
  const separator = tail.indexOf('--');
  if (separator !== -1) tail.splice(separator, 1);
  return [...argv.slice(0, index), '--', ...tail];
};
