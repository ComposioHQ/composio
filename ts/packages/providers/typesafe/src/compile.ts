import {
  dereferenceJsonSchema,
  JSONSchemaPropertySchema,
  type JSONSchemaProperty,
  type Tool,
} from '@composio/core';
import { z } from 'zod/v3';
import { classifyProperty } from './classify';
import { buildOptions, NONE_KEY, NOT_STATED_KEY, NULL_KEY, optionKey, optionLabel } from './keys';
import {
  TypesafeDuplicateToolError,
  type TypesafeArgumentQuestion,
  type TypesafeChoiceQuestion,
  type TypesafeNoulQuestion,
  type TypesafeOption,
  type TypesafeRisk,
  type TypesafeToolQuestions,
  type TypesafeToolSet,
} from './types';

const InputParametersSchema = z.object({
  properties: z.record(z.string(), z.unknown()).optional(),
  required: z.array(z.string()).optional(),
});

/** Code-unit order, which Python reproduces by sorting on the UTF-16 encoding. */
const byCodeUnit = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function riskOf(tool: Tool): TypesafeRisk {
  const tags = tool.tags ?? [];
  if (tags.includes('destructiveHint')) return 'destructive';
  return tags.includes('readOnlyHint') ? 'read_only' : 'mutating';
}

const withDescription = (sentence: string, description: string): string =>
  description.length > 0 ? `${sentence} ${description}` : sentence;

function choiceQuestion(
  toolName: string,
  argument: string,
  description: string,
  options: TypesafeOption[],
  optionText: (option: TypesafeOption) => string
): TypesafeChoiceQuestion {
  const criteria: Record<string, string> = {};
  for (const option of options) criteria[option.key] = optionText(option);
  criteria[NOT_STATED_KEY] = `The request does not state a value for "${argument}".`;
  return {
    type: 'choice',
    instructions: withDescription(
      `For the tool "${toolName}", which value of "${argument}" does the request state?`,
      description
    ),
    criteria,
  };
}

function enumOptionText(argument: string, option: TypesafeOption): string {
  return option.value === null
    ? `The request explicitly asks for no value (null) for "${argument}".`
    : `The value "${optionLabel(option.value)}" for "${argument}".`;
}

function compileArgument(
  toolName: string,
  argument: string,
  index: number,
  required: boolean,
  property: JSONSchemaProperty
): TypesafeArgumentQuestion | undefined {
  const argumentClass = classifyProperty(property);
  const description = property.description ?? '';
  const questionId = `a${index}`;

  if (argumentClass.kind === 'open') return undefined;

  if (argumentClass.kind === 'boolean') {
    const options: TypesafeOption[] = [
      { key: 'yes', value: true },
      { key: 'no', value: false },
    ];
    return {
      kind: 'choice',
      name: argument,
      required,
      questionId,
      question: choiceQuestion(toolName, argument, description, options, option =>
        option.value === true
          ? `The request states that "${argument}" is true.`
          : `The request states that "${argument}" is false.`
      ),
      options,
      notStatedKey: NOT_STATED_KEY,
    };
  }

  if (argumentClass.kind === 'enum') {
    const options = buildOptions(argumentClass.values);
    if (argumentClass.nullable) options.push({ key: NULL_KEY, value: null });
    return {
      kind: 'choice',
      name: argument,
      required,
      questionId,
      question: choiceQuestion(toolName, argument, description, options, option =>
        enumOptionText(argument, option)
      ),
      options,
      notStatedKey: NOT_STATED_KEY,
    };
  }

  const mentioned: TypesafeNoulQuestion = {
    type: 'noul',
    instructions: withDescription(
      `For the tool "${toolName}", does the request state which values "${argument}" should contain?`,
      description
    ),
  };
  return {
    kind: 'array',
    name: argument,
    required,
    mentionedId: `${questionId}_mentioned`,
    mentioned,
    members: argumentClass.values.map((value, memberIndex) => ({
      questionId: `${questionId}_m${memberIndex}`,
      value,
      question: {
        type: 'noul',
        instructions: `For the tool "${toolName}", does the request state that "${argument}" should include the value "${optionLabel(value)}"?`,
      },
    })),
    ...(argumentClass.maxItems === undefined ? {} : { maxItems: argumentClass.maxItems }),
  };
}

/** The text of a tool's option in the routing Choice. */
export const routingDescriptionOf = (tool: Tool): string =>
  tool.description ? `${tool.name}: ${tool.description}` : tool.name;

/** Compiles one tool. Never throws on a schema: what it cannot read is open-ended. */
export function compileTool(tool: Tool): TypesafeToolQuestions {
  const dereferenced: unknown = dereferenceJsonSchema(
    tool.inputParameters ?? { type: 'object', properties: {} },
    { onUnresolved: 'sentinel' }
  );
  const parsed = InputParametersSchema.safeParse(dereferenced);
  const properties = parsed.success ? (parsed.data.properties ?? {}) : {};
  const names = Object.keys(properties).sort(byCodeUnit);
  // `required` is a set, and a name with no matching property is ignored.
  const requiredSet = new Set(parsed.success ? (parsed.data.required ?? []) : []);

  const compiled: TypesafeArgumentQuestion[] = [];
  const openEnded: string[] = [];
  names.forEach((argument, index) => {
    const property = JSONSchemaPropertySchema.safeParse(properties[argument]);
    const question = property.success
      ? compileArgument(tool.name, argument, index, requiredSet.has(argument), property.data)
      : undefined;
    if (question === undefined) openEnded.push(argument);
    else compiled.push(question);
  });

  return {
    slug: tool.slug,
    name: tool.name,
    routingDescription: routingDescriptionOf(tool),
    ...(tool.version === undefined ? {} : { version: tool.version }),
    risk: riskOf(tool),
    arguments: compiled,
    openEnded,
    required: names.filter(name => requiredSet.has(name)),
  };
}

export function compileToolSet(tools: TypesafeToolQuestions[]): TypesafeToolSet {
  if (new Set(tools.map(tool => tool.slug)).size !== tools.length) {
    throw new TypesafeDuplicateToolError();
  }
  return { tools };
}

export const ROUTING_QUESTION_ID = 'route';

/** The routing Choice over a tool set, with the keys needed to read its answer. */
export function routingQuestion(
  tools: ReadonlyArray<{ slug: string; routingDescription: string }>
): {
  question: TypesafeChoiceQuestion;
  keys: string[];
} {
  const keys = tools.map((tool, index) => optionKey(tool.slug, index));
  const criteria: Record<string, string> = {};
  tools.forEach((tool, index) => {
    criteria[keys[index]] = tool.routingDescription;
  });
  criteria[NONE_KEY] = 'None of these tools carries out the request.';
  return {
    question: {
      type: 'choice',
      instructions: 'Which tool carries out what the user asks for?',
      criteria,
    },
    keys,
  };
}
