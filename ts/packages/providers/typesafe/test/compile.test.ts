import { existsSync, readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TypesafeDuplicateToolError, TypesafeProvider } from '../src';
import { routingQuestion } from '../src/compile';
import { NOT_STATED_KEY, buildOptions, optionValues } from '../src/keys';
import { CORPUS_URL, corpus, corpusTool, makeTool } from './helpers';

const provider = new TypesafeProvider();
const wrap = (name: string) => provider.wrapTool(corpusTool(name));

describe('question corpus', () => {
  it.each(corpus.tools.map(entry => [entry.name, entry] as const))(
    'compiles %s to its expected questions',
    (_name, entry) => {
      const compiled = provider.wrapTool(entry.tool);
      expect(compiled).toEqual(entry.expected);
      expect(JSON.parse(JSON.stringify(compiled))).toEqual(compiled);
      expect(JSON.stringify(provider.wrapTool(entry.tool))).toBe(JSON.stringify(compiled));
    }
  );

  it.each(corpus.sets.map(set => [set.name, set] as const))(
    'builds the routing Choice for %s',
    (_name, set) => {
      const tools = set.tools.map(tool =>
        typeof tool === 'string'
          ? provider.wrapTool(corpus.tools.find(entry => entry.tool.slug === tool)!.tool)
          : tool
      );
      expect(routingQuestion(tools)).toEqual(set.expected);
    }
  );

  // Phase A ships before the Python package, so the comparison waits for the Python copy.
  const pythonCorpus = new URL(
    '../../../../../python/tests/fixtures/typesafe_question_corpus.json',
    import.meta.url
  );
  it.skipIf(!existsSync(pythonCorpus))('is byte-identical to the Python corpus', () => {
    expect(readFileSync(pythonCorpus).equals(readFileSync(CORPUS_URL))).toBe(true);
  });
});

describe('wrapTool', () => {
  it('wraps the release-gate tool with zero argument questions', () => {
    const compiled = provider.wrapTool(
      makeTool('COMPATIBILITY_CHECK', { value: { type: 'string' } }, ['value'])
    );
    expect(compiled).toMatchObject({ arguments: [], openEnded: ['value'], required: ['value'] });
  });

  it('compiles a tool with no inputParameters as a zero-argument tool', () => {
    expect(wrap('no_input_parameters')).toMatchObject({
      arguments: [],
      openEnded: [],
      required: [],
    });
  });

  it('finds an enum behind $ref after dereferencing', () => {
    const [level] = wrap('ref_enum').arguments;
    expect(level).toMatchObject({ kind: 'choice', name: 'level', required: true });
    expect(level.kind === 'choice' && level.question.instructions).toContain('Log level.');
  });

  it('keeps declared order for numeric-looking labels and restores the original strings', () => {
    const [size] = wrap('numeric_looking_labels').arguments;
    if (size.kind !== 'choice') throw new Error('expected a choice');
    expect(Object.keys(size.question.criteria)).toEqual(['o0_10', 'o1_2', 'high', NOT_STATED_KEY]);
    expect([...optionValues(size.options).values()]).toEqual(['10', '2', 'high']);
  });

  it('round-trips hostile labels', () => {
    const [value] = wrap('hostile_labels').arguments;
    if (value.kind !== 'choice') throw new Error('expected a choice');
    const keys = value.options.map(option => option.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(NOT_STATED_KEY);
    expect(Object.keys(value.question.criteria)).toEqual([...keys, NOT_STATED_KEY]);
    const restored = optionValues(value.options);
    expect(keys.map(key => restored.get(key))).toEqual(
      corpusTool('hostile_labels').inputParameters?.properties?.value.enum
    );
  });

  it('gives a single-member enum a not-stated option', () => {
    const [format] = wrap('single_member_enum').arguments;
    if (format.kind !== 'choice') throw new Error('expected a choice');
    expect(Object.keys(format.question.criteria)).toEqual(['csv', NOT_STATED_KEY]);
  });

  it('asks a boolean as a three-option Choice and never reads the schema default', () => {
    const [flag] = wrap('boolean_with_default').arguments;
    if (flag.kind !== 'choice') throw new Error('expected a choice');
    expect(flag.options).toEqual([
      { key: 'yes', value: true },
      { key: 'no', value: false },
    ]);
    expect(Object.keys(flag.question.criteria)).toEqual(['yes', 'no', NOT_STATED_KEY]);
  });

  it('gives delimiter-laden argument names distinct question IDs', () => {
    const ids = wrap('delimiter_argument_names').arguments.map(argument =>
      argument.kind === 'choice' ? argument.questionId : argument.mentionedId
    );
    expect(new Set(ids).size).toBe(4);
    expect(ids.every(id => /^[a-z0-9_]+$/.test(id))).toBe(true);
  });

  it('treats required as a set and ignores a name with no property', () => {
    expect(wrap('required_without_property').required).toEqual(['mode']);
  });

  it('does not throw on a property type outside the schema', () => {
    expect(wrap('unknown_type_open_ended')).toMatchObject({ arguments: [], openEnded: ['when'] });
  });

  it('records the risk class from tags', () => {
    expect(wrap('destructive_tag').risk).toBe('destructive');
    expect(wrap('read_only_tag').risk).toBe('read_only');
    expect(wrap('string_enum_required').risk).toBe('mutating');
  });

  it('uses the name when the description is empty', () => {
    expect(wrap('empty_description').routingDescription).toBe('No description');
  });

  it('applies a describe override to one argument and leaves the others unchanged', () => {
    const tool = makeTool('TWO_FLAGS', {
      archived: { type: 'boolean', description: 'Generated archived text.' },
      pinned: { type: 'boolean', description: 'Generated pinned text.' },
    });
    const described = new TypesafeProvider({
      describe: {
        argument: ({ argument }) => (argument === 'pinned' ? 'Keep it at the top.' : undefined),
        tool: () => 'Flags a thing.',
      },
    }).wrapTool(tool);
    const [archived, pinned] = described.arguments;
    expect(archived).toEqual(provider.wrapTool(tool).arguments[0]);
    expect(pinned.kind === 'choice' && pinned.question.instructions).toContain(
      'Keep it at the top.'
    );
    expect(pinned.kind === 'choice' && pinned.question.instructions).not.toContain('Generated');
    expect(described.routingDescription).toBe('Flags a thing.');
  });
});

describe('wrapTools', () => {
  it('returns an empty tool set for no tools', () => {
    expect(provider.wrapTools([])).toEqual({ tools: [] });
  });

  it('throws on duplicate slugs', () => {
    expect(() => provider.wrapTools([makeTool('SAME'), makeTool('SAME')])).toThrow(
      TypesafeDuplicateToolError
    );
  });
});

describe('option keys', () => {
  it('round-trips arbitrary string enums from option key to original value', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.string(), { minLength: 1, maxLength: 40 }), labels => {
        const options = buildOptions(labels);
        const keys = options.map(option => option.key);
        expect(new Set(keys).size).toBe(labels.length);
        expect(keys.some(key => key.startsWith('__'))).toBe(false);
        const criteria = Object.fromEntries(keys.map(key => [key, 'description']));
        expect(Object.keys(criteria)).toEqual(keys);
        const restored = optionValues(options);
        expect(keys.map(key => restored.get(key))).toEqual(labels);
      })
    );
  });
});
