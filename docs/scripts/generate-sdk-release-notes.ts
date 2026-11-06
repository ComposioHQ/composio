import { Data, Effect, FileSystem, Path, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

const Language = Schema.Literals(['typescript', 'python']);
type Language = typeof Language.Type;

const ReleaseDocumentationPlan = Schema.Struct({
  releases: Schema.Array(
    Schema.Struct({ name: Schema.String, newVersion: Schema.String, language: Language })
  ),
  changesets: Schema.Array(Schema.Struct({ summary: Schema.String })),
});
export type ReleaseDocumentationPlan = typeof ReleaseDocumentationPlan.Encoded;

const REQUEST_PATH = /^\/ComposioHQ\/composio\/issues\/\d+$/;
const isRequestUrl = (value: string) =>
  URL.canParse(value) &&
  new URL(value).origin === 'https://github.com' &&
  REQUEST_PATH.test(new URL(value).pathname);

const ReleaseNoteOptions = Schema.Struct({
  releaseId: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)),
  date: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
  requestUrl: Schema.String.check(
    Schema.makeFilter(value =>
      isRequestUrl(value) ? undefined : 'The request URL must link to a repository issue'
    )
  ),
});
export type ReleaseNoteOptions = typeof ReleaseNoteOptions.Type;

export class ReleaseNotesError extends Data.TaggedError('ReleaseNotesError')<{
  readonly message: string;
}> {}

/** How each language appears in the docs version table and how its reference docs are generated. */
const LANGUAGE_DOCS: Record<
  Language,
  {
    readonly label: (name: string) => string;
    readonly reference: {
      readonly command: string;
      readonly args: ReadonlyArray<string>;
      readonly directory: string;
    };
  }
> = {
  typescript: {
    label: name => `TypeScript \`${name}\``,
    reference: {
      command: 'pnpm',
      args: ['--filter', '@composio/core', 'generate:docs'],
      directory: '.',
    },
  },
  python: {
    label: () => 'Python `composio`',
    reference: {
      command: 'uv',
      args: ['run', '--with', 'griffe', 'python', 'scripts/generate-docs.py'],
      directory: 'python',
    },
  },
};

type Plan = typeof ReleaseDocumentationPlan.Type;

const targets = (plan: Plan) =>
  Object.fromEntries(plan.releases.map(release => [release.name, release.newVersion]));

const versionTable = (plan: Plan) =>
  [
    '| SDK | Version |',
    '| --- | --- |',
    ...plan.releases.map(
      release =>
        `| ${LANGUAGE_DOCS[release.language].label(release.name)} | \`${release.newVersion}\` |`
    ),
  ].join('\n');

const entryPath = (options: ReleaseNoteOptions) => {
  const [year, month, day] = options.date.split('-');
  return `docs/content/changelog/${month}-${day}-${year.slice(2)}-sdk-${options.releaseId}.mdx`;
};

// A backtick run that is not escaped, closed by a run of the same length, as CommonMark pairs them.
const CODE = /((?<![\\`])(`+)(?!`)[\s\S]*?(?<!`)\2(?!`))/;

/**
 * Keeps a contributor's changeset summary as Markdown while disabling MDX: braces and tags
 * outside code become literal text, and a line cannot start an `import` or `export` statement.
 */
export const literalMdx = (markdown: string) =>
  markdown
    .split(CODE)
    .map((part, index) =>
      index % 3 === 1
        ? part
        : index % 3 === 2
          ? ''
          : part
              .replace(/[{}]/g, brace => `\\${brace}`)
              .replaceAll('<', '&lt;')
              .replace(
                /^(\s*)(import|export)\b/gm,
                (_match, indent: string, word: string) =>
                  `${indent}&#${word.charCodeAt(0)};${word.slice(1)}`
              )
    )
    .join('');

const renderEntry = (plan: Plan, options: ReleaseNoteOptions) => {
  const summaries = [
    ...new Set(plan.changesets.map(note => literalMdx(note.summary.trim())).filter(Boolean)),
  ];
  return `---\ntitle: ${JSON.stringify(`SDK release ${options.releaseId}`)}\ndate: ${JSON.stringify(options.date)}\nsdkRelease: ${JSON.stringify(options.releaseId)}\nsdkReleaseTargets: ${JSON.stringify(targets(plan))}\n---\n\nSee the [release request](${options.requestUrl}) for publication status.\n\n### SDK Versions\n\n${versionTable(plan)}\n\n### Changes\n\n${summaries.join('\n\n')}\n`;
};

/** Writes the release's changelog entry; preparation always starts from a clean checkout. */
export const generateSdkReleaseNotes = (
  cwd: string,
  value: ReleaseDocumentationPlan,
  input: ReleaseNoteOptions
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const plan = yield* Schema.decodeUnknownEffect(ReleaseDocumentationPlan)(value);
    const options = yield* Schema.decodeUnknownEffect(ReleaseNoteOptions)(input);
    if (!plan.releases.length)
      return yield* new ReleaseNotesError({ message: 'Nothing to document' });
    const relativePath = entryPath(options);
    const absolutePath = path.resolve(cwd, relativePath);
    yield* fs.makeDirectory(path.dirname(absolutePath), { recursive: true });
    yield* fs.writeFileString(absolutePath, renderEntry(plan, options), { flag: 'wx' });
    return relativePath;
  });

/** Regenerates the symbol reference for each released language, streaming generator output. */
export const generateSdkReleaseReferences = (cwd: string, value: ReleaseDocumentationPlan) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const plan = yield* Schema.decodeUnknownEffect(ReleaseDocumentationPlan)(value);
    const languages = [...new Set(plan.releases.map(release => release.language))];
    return yield* Effect.forEach(languages, language =>
      Effect.gen(function* () {
        const { command, args, directory } = LANGUAGE_DOCS[language].reference;
        const exitCode = yield* spawner.exitCode(
          ChildProcess.make(command, args, {
            cwd: path.resolve(cwd, directory),
            stdin: 'inherit',
            stdout: 'inherit',
            stderr: 'inherit',
          })
        );
        if (exitCode !== 0)
          return yield* new ReleaseNotesError({
            message: `${language} reference generation failed: ${exitCode}`,
          });
        return `docs/content/reference/sdk-reference/${language}`;
      })
    );
  });
