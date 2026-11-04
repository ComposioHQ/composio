import { Option } from 'effect';
import type { Command } from 'effect/cli';
import type { CommandTelemetryInput } from './types';
import { withCommandMeta } from 'src/invocation/command-identity';

type Value = string | number | boolean | undefined;
type Field = { readonly value: Value; readonly flags?: ReadonlyArray<string> };
const value = (value: Value): Field => ({ value });
const flag = (name: string, enabled: boolean): Field => ({
  value: enabled,
  flags: enabled ? [name] : [],
});
const present = (input: Option.Option<string> | undefined) =>
  input !== undefined && Option.isSome(input);
const optional = (input: Option.Option<string> | undefined) =>
  input === undefined ? undefined : Option.getOrUndefined(input);

/** One allowlist supplies both safe properties and canonical enabled flag names. */
const fields = (
  input: Readonly<Record<string, Field>>,
  argument?: string
): CommandTelemetryInput => ({
  argument,
  options: Object.fromEntries(
    Object.entries(input)
      .filter(([, field]) => field.value !== undefined)
      .map(([key, field]) => [key, field.value])
  ),
  flagNames: [...new Set(Object.values(input).flatMap(field => field.flags ?? []))].sort(),
});

/** Select only measured fields. Neither values nor flag names are taken from raw argv. */
export const telemetry = { fields, value, flag, present, optional };

/** Bind a privacy projection to the same command whose parser owns its input type. */
export const withCommandTelemetry = <Name extends string, Input, ContextInput, E, R>(
  command: Command.Command<Name, Input, ContextInput, E, R>,
  project: (input: NoInfer<Input>) => CommandTelemetryInput
): Command.Command<Name, Input, ContextInput, E, R> =>
  withCommandMeta({
    // Command annotations erase Input. Only this command's parsed input reaches this callback.
    telemetryInput: input => project(input as Input),
  })(command);
