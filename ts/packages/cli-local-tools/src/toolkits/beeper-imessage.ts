import { spawn } from 'node:child_process';
import { z } from 'zod/v3';
import { runLocalCommand } from '../runtime';
import type {
  LocalCommandExecution,
  LocalExecutionContext,
  LocalExecutionResult,
  LocalToolkitDeclaration,
  LocalToolDeclaration,
} from '../types';

const IMESSAGE_CLI_BINARY_ID = 'beeper-imessage-cli';
const IMESSAGE_CLI_VERSION = '0.21.0';
const COMMAND_TIMEOUT_MS = 120_000;
const SEND_VERIFY_TIMEOUT_MS = 8_000;
const SEND_VERIFY_INTERVAL_MS = 500;
const THREAD_SCAN_DEFAULT_MAX_PAGES = 10;
const THREAD_SCAN_MAX_PAGES = 50;
const CONTACT_LOOKUP_TIMEOUT_MS = 5_000;
const REACTION_PREPARE_TIMEOUT_MS = 5_000;
const REACTION_TIMEOUT_MS = 20_000;

const baseInput = z.object({
  dataDir: z
    .string()
    .min(1)
    .optional()
    .describe('Optional directory for imessage-cli state. Defaults to a temporary directory.'),
  useSecondaryInstance: z
    .boolean()
    .default(true)
    .describe(
      'Use a secondary Messages.app instance. This is usually fine for read/send/list tools. UI-dependent tools such as reactions default to the primary Messages.app instance because they need the transcript view to be visible.'
    ),
  verbose: z.boolean().default(false).describe('Enable verbose imessage-cli logging.'),
});

const primaryInstanceInput = baseInput.extend({
  useSecondaryInstance: z
    .boolean()
    .default(false)
    .describe(
      'Use a secondary Messages.app instance. Defaults to false for reactions because the upstream UI automation needs the primary transcript view to be visible.'
    ),
});

const cursorInput = z.object({
  before: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Fetch items older than this cursor. For LIST_THREADS, use result.pageInfo.nextBefore.'
    ),
  after: z.string().min(1).optional().describe('Fetch items newer than this cursor.'),
});

const cliOutput = z.object({
  ok: z.boolean(),
  commandName: z.string(),
  callId: z.string().optional(),
  durationMs: z.number().optional(),
  result: z.unknown().optional(),
  resultText: z.string().optional(),
  stdout: z.string(),
  stderr: z.string(),
});

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(item => String(item)) : [];

const stringValue = (value: unknown): string => String(value ?? '');

const optionalString = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : undefined;
};

const absolutePath = (value: unknown): string => stringValue(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toRecordArray = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value) && Array.isArray(value.items)) return value.items.filter(isRecord);
  return [];
};

const normalizePhone = (value: string): string => value.replace(/[^0-9]/g, '');

const normalizeIdentifier = (value: unknown): string => {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!text) return '';
  if (text.includes('@')) return text;
  const digits = normalizePhone(text);
  return digits || text;
};

const unique = <T>(values: ReadonlyArray<T>): T[] => [...new Set(values)];

const compactRecord = (record: Record<string, unknown>, keys: ReadonlyArray<string>) =>
  Object.fromEntries(keys.filter(key => record[key] !== undefined).map(key => [key, record[key]]));

const messageIdOf = (message: unknown): string | undefined =>
  isRecord(message) ? optionalString(message.id) : undefined;

const messageTextOf = (message: unknown): string =>
  isRecord(message) ? stringValue(message.text ?? '') : '';

const messageIsSender = (message: unknown): boolean =>
  isRecord(message) && message.isSender === true;

const messageMatchesSentText = (message: unknown, text: string): boolean =>
  messageIsSender(message) && messageTextOf(message) === text;

const extractPageItems = (result: unknown): Record<string, unknown>[] =>
  isRecord(result) ? toRecordArray(result.items) : [];

const extractThreadId = (value: unknown): string | undefined => {
  if (!isRecord(value)) return undefined;
  return optionalString(value.id ?? value.threadId ?? value.threadID ?? value.chatId);
};

const participantIdentifiers = (thread: Record<string, unknown>): string[] => {
  const participants = toRecordArray(thread.participants);
  return unique(
    participants.flatMap(participant =>
      [participant.email, participant.phoneNumber, participant.handle, participant.id]
        .map(optionalString)
        .filter((value): value is string => Boolean(value))
    )
  );
};

const latestMessage = (thread: Record<string, unknown>): Record<string, unknown> | undefined => {
  const messages = toRecordArray(thread.messages);
  return messages[0];
};

const buildGlobalArgs = (input: Record<string, unknown>): string[] => {
  const args: string[] = [];
  const dataDir = optionalString(input.dataDir);
  if (dataDir) args.push('--data-dir', dataDir);
  if (input.useSecondaryInstance === false) args.push('--no-use-secondary-instance');
  // Local tools are one-shot calls. Avoid keeping DB event watchers open unless a
  // future streaming tool explicitly opts in.
  args.push('--no-events');
  if (input.verbose === true) args.push('--verbose');
  return args;
};

const withCursorArgs = (input: Record<string, unknown>, args: string[]): string[] => {
  const before = optionalString(input.before);
  const after = optionalString(input.after);
  if (before && after) throw new Error('Use only one of before or after.');
  if (before) args.push('--before', before);
  if (after) args.push('--after', after);
  return args;
};

const stripAnsi = (text: string): string => text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');

const parseImessageCliOutput = (
  commandName: string,
  stdout: string,
  stderr: string
): LocalExecutionResult => {
  const cleanStdout = stripAnsi(stdout);
  const lines = cleanStdout.split(/\r?\n/);
  const okIndex = lines.findIndex(line => /^\[\d+\] ok /.test(line));
  const okLine = okIndex >= 0 ? lines[okIndex] : undefined;
  const match = okLine?.match(/^\[(\d+)\] ok \S+ \((\d+(?:\.\d+)?)ms\)$/);

  const resultLines = okIndex >= 0 ? lines.slice(okIndex + 1) : lines;
  const resultText = resultLines
    .filter(line => line.trim() !== 'Exiting...')
    .join('\n')
    .trim();

  let parsed: unknown;
  if (resultText) {
    try {
      parsed = JSON.parse(resultText) as unknown;
    } catch {
      parsed = undefined;
    }
  }

  return {
    ok: true,
    commandName,
    ...(match?.[1] ? { callId: match[1] } : {}),
    ...(match?.[2] ? { durationMs: Number(match[2]) } : {}),
    ...(parsed !== undefined ? { result: parsed } : {}),
    ...(resultText ? { resultText } : {}),
    stdout,
    stderr,
  };
};

const runImessageCli = async (
  commandName: string,
  commandArgs: ReadonlyArray<string>,
  input: Record<string, unknown>,
  context: LocalExecutionContext,
  options: { readonly timeoutMs?: number } = {}
): Promise<LocalExecutionResult> => {
  const execution: LocalCommandExecution = {
    kind: 'command',
    command: {
      bundledBinary: IMESSAGE_CLI_BINARY_ID,
      fallbackCommand: 'imessage-cli',
    },
    args: [...buildGlobalArgs(input), commandName, ...commandArgs],
    timeoutMs: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
  };
  const result = await runLocalCommand(execution, input, context);
  return parseImessageCliOutput(
    commandName,
    String(result.stdout ?? ''),
    String(result.stderr ?? '')
  );
};

const runProcess = async (
  command: string,
  args: ReadonlyArray<string>,
  timeoutMs: number
): Promise<{ readonly stdout: string; readonly stderr: string }> => {
  const child = spawn(command, [...args], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    stdout += chunk;
  });
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });

  const exitPromise = new Promise<{
    readonly exitCode: number | null;
    readonly signal: string | null;
  }>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }));
  });
  const timeout = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
  const { exitCode, signal } = await exitPromise.finally(() => clearTimeout(timeout));
  if (exitCode !== 0) {
    throw new Error(
      `${command} failed with exitCode=${exitCode ?? 'null'} signal=${signal ?? 'null'}${
        stderr.trim() ? `: ${stderr.trim()}` : ''
      }`
    );
  }
  return { stdout, stderr };
};

const contactLookupScript = `
function normalizePhone(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}
function normalizeIdentifier(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  if (text.indexOf('@') >= 0) return text;
  return normalizePhone(text) || text;
}
function valuesOf(collection) {
  try { return collection().map(item => String(item.value())); } catch (_) { return []; }
}
function personName(person) {
  try { return String(person.name() || '').trim(); } catch (_) { return ''; }
}
function run(argv) {
  const mode = argv[0] || 'query';
  const payload = JSON.parse(argv[1] || '{}');
  const query = String(payload.query || '').toLowerCase();
  const requestedIdentifiers = (payload.identifiers || []).map(normalizeIdentifier).filter(Boolean);
  const requestedSet = new Set(requestedIdentifiers);
  const Contacts = Application('Contacts');
  const people = Contacts.people();
  const matches = [];
  const labels = {};
  for (const person of people) {
    const name = personName(person);
    const emails = valuesOf(person.emails);
    const phones = valuesOf(person.phones);
    const identifiers = emails.concat(phones);
    const normalized = identifiers.map(normalizeIdentifier).filter(Boolean);
    const haystack = [name].concat(identifiers).join(' ').toLowerCase();
    if (mode === 'query' && query && haystack.indexOf(query) >= 0) {
      matches.push({ name, emails, phones, identifiers });
    }
    if (mode === 'labels') {
      for (let index = 0; index < normalized.length; index += 1) {
        const value = normalized[index];
        if (requestedSet.has(value)) labels[value] = name || identifiers[index] || value;
      }
    }
  }
  return JSON.stringify({ matches: matches.slice(0, 25), labels });
}
`;

interface ContactLookupResult {
  readonly matches: ReadonlyArray<{
    readonly name?: string;
    readonly emails?: ReadonlyArray<string>;
    readonly phones?: ReadonlyArray<string>;
    readonly identifiers?: ReadonlyArray<string>;
  }>;
  readonly labels: Record<string, string>;
  readonly error?: string;
}

const emptyContactLookup = (error?: string): ContactLookupResult => ({
  matches: [],
  labels: {},
  ...(error ? { error } : {}),
});

const lookupContacts = async (
  mode: 'query' | 'labels',
  payload: Record<string, unknown>
): Promise<ContactLookupResult> => {
  if (process.platform !== 'darwin') return emptyContactLookup('Contacts lookup requires macOS.');
  try {
    const result = await runProcess(
      'osascript',
      ['-l', 'JavaScript', '-e', contactLookupScript, mode, JSON.stringify(payload)],
      CONTACT_LOOKUP_TIMEOUT_MS
    );
    const parsed = JSON.parse(result.stdout.trim()) as unknown;
    if (!isRecord(parsed))
      return emptyContactLookup('Contacts lookup returned a non-object result.');
    return {
      matches: Array.isArray(parsed.matches) ? parsed.matches.filter(isRecord) : [],
      labels: isRecord(parsed.labels)
        ? Object.fromEntries(
            Object.entries(parsed.labels).map(([key, value]) => [key, String(value)])
          )
        : {},
    };
  } catch (error) {
    return emptyContactLookup(error instanceof Error ? error.message : String(error));
  }
};

const contactIdentifiersFromMatches = (lookup: ContactLookupResult): string[] =>
  unique(
    lookup.matches.flatMap(match =>
      [...(match.identifiers ?? []), ...(match.emails ?? []), ...(match.phones ?? [])]
        .map(normalizeIdentifier)
        .filter(Boolean)
    )
  );

const labelsForThreads = async (
  threads: ReadonlyArray<Record<string, unknown>>,
  enabled: boolean
): Promise<Record<string, string>> => {
  if (!enabled || threads.length === 0) return {};
  const identifiers = unique(threads.flatMap(thread => participantIdentifiers(thread))).map(
    normalizeIdentifier
  );
  if (identifiers.length === 0) return {};
  return (await lookupContacts('labels', { identifiers })).labels;
};

const compactParticipant = (
  participant: Record<string, unknown>,
  labels: Record<string, string>
): Record<string, unknown> => {
  const identifier = optionalString(
    participant.email ?? participant.phoneNumber ?? participant.handle
  );
  const normalized = normalizeIdentifier(identifier);
  return {
    ...compactRecord(participant, ['isSelf', 'email', 'phoneNumber', 'handle']),
    ...(identifier && labels[normalized] ? { label: labels[normalized] } : {}),
  };
};

const compactMessage = (message: unknown): Record<string, unknown> | undefined => {
  if (!isRecord(message)) return undefined;
  return compactRecord(message, [
    'id',
    'text',
    'isSender',
    'timestamp',
    'isDelivered',
    'isErrored',
    'seen',
  ]);
};

const compactThread = (thread: Record<string, unknown>, labels: Record<string, string>) => {
  const participants = toRecordArray(thread.participants).map(participant =>
    compactParticipant(participant, labels)
  );
  const lastMessage = compactMessage(latestMessage(thread));
  const participantLabels = unique(
    participants
      .map(participant =>
        optionalString(participant.label ?? participant.email ?? participant.phoneNumber)
      )
      .filter((value): value is string => Boolean(value))
  );
  return {
    ...compactRecord(thread, [
      'id',
      'title',
      'type',
      'timestamp',
      'folderName',
      'unreadCount',
      'isUnread',
      'isReadOnly',
      'isPinned',
      'isMarkedUnread',
      'isLowPriority',
      'lastReadMessageSortKey',
    ]),
    participantLabels,
    participants,
    ...(lastMessage ? { lastMessage } : {}),
  };
};

const pageInfoFor = (result: unknown) => {
  const record = isRecord(result) ? result : {};
  const oldestCursor = optionalString(record.oldestCursor);
  return {
    hasMore: record.hasMore === true,
    oldestCursor,
    nextBefore: oldestCursor,
    nextSteps: oldestCursor
      ? `Fetch older threads with { "before": "${oldestCursor}" }.`
      : 'No older cursor was returned.',
  };
};

const compactThreadsResult = async (
  rawResult: LocalExecutionResult,
  options: {
    readonly compact: boolean;
    readonly includeRaw: boolean;
    readonly resolveContactNames: boolean;
  }
): Promise<LocalExecutionResult> => {
  if (!options.compact || !isRecord(rawResult.result)) return rawResult;
  const threads = extractPageItems(rawResult.result);
  const labels = await labelsForThreads(threads, options.resolveContactNames);
  const compactResult = {
    items: threads.map(thread => compactThread(thread, labels)),
    pageInfo: pageInfoFor(rawResult.result),
    contactResolution: {
      enabled: options.resolveContactNames,
      resolvedLabels: Object.keys(labels).length,
    },
    ...(options.includeRaw ? { raw: rawResult.result } : {}),
  };
  return {
    ...rawResult,
    result: compactResult,
    resultText: undefined,
    stdout: options.includeRaw ? rawResult.stdout : '',
  };
};

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const fetchMessages = async (
  threadId: string,
  input: Record<string, unknown>,
  context: LocalExecutionContext
): Promise<LocalExecutionResult> => runImessageCli('messages', [threadId], input, context);

const pollForSentMessage = async (params: {
  readonly threadId: string;
  readonly text: string;
  readonly input: Record<string, unknown>;
  readonly context: LocalExecutionContext;
  readonly timeoutMs: number;
  readonly excludeMessageIds?: ReadonlySet<string>;
}): Promise<{
  readonly message?: Record<string, unknown>;
  readonly messagesResult?: LocalExecutionResult;
  readonly attempts: number;
}> => {
  const deadline = Date.now() + params.timeoutMs;
  let attempts = 0;
  let lastResult: LocalExecutionResult | undefined;

  do {
    attempts += 1;
    lastResult = await fetchMessages(params.threadId, params.input, params.context);
    const messages = extractPageItems(lastResult.result);
    const message = messages.find(candidate => {
      const candidateId = messageIdOf(candidate);
      return (
        messageMatchesSentText(candidate, params.text) &&
        (!candidateId || !params.excludeMessageIds?.has(candidateId))
      );
    });
    if (message) return { message, messagesResult: lastResult, attempts };
    if (Date.now() < deadline) await delay(SEND_VERIFY_INTERVAL_MS);
  } while (Date.now() < deadline);

  return { messagesResult: lastResult, attempts };
};

const enhanceSendResult = (params: {
  readonly commandResult: LocalExecutionResult;
  readonly threadId?: string;
  readonly sentText: string;
  readonly sentMessage?: Record<string, unknown>;
  readonly messagesResult?: LocalExecutionResult;
  readonly attempts: number;
  readonly verify: boolean;
}): LocalExecutionResult => {
  const sentMessageId = messageIdOf(params.sentMessage);
  const sendVerification = {
    commandSucceeded: params.commandResult.ok === true,
    verified: Boolean(params.sentMessage),
    status: params.sentMessage
      ? 'observed_sent_message'
      : params.verify
        ? 'command_succeeded_but_sent_message_not_observed_yet'
        : 'not_requested',
    attempts: params.attempts,
    threadId: params.threadId,
    sentMessageId,
  };

  let enhancedResult = params.commandResult.result;
  if (isRecord(enhancedResult) && params.sentMessage) {
    const messagesPage = isRecord(params.messagesResult?.result)
      ? params.messagesResult?.result
      : { items: [params.sentMessage], hasMore: false };
    enhancedResult = {
      ...enhancedResult,
      messages: messagesPage,
      sentMessage: params.sentMessage,
      sentMessageId,
      sendVerification,
    };
  } else if (isRecord(enhancedResult)) {
    enhancedResult = {
      ...enhancedResult,
      sentMessage: params.sentMessage ?? null,
      sentMessageId,
      sendVerification,
    };
  } else {
    enhancedResult = {
      originalResult: enhancedResult,
      sentMessage: params.sentMessage ?? null,
      sentMessageId,
      sendVerification,
    };
  }

  return {
    ...params.commandResult,
    result: enhancedResult,
    sentMessage: params.sentMessage ?? null,
    sentMessageId,
    sendVerification,
    resultText: JSON.stringify(enhancedResult, null, 2),
  };
};

const threadMatches = (params: {
  readonly thread: Record<string, unknown>;
  readonly query?: string;
  readonly recipientIdentifiers: ReadonlySet<string>;
  readonly contactIdentifiers: ReadonlySet<string>;
  readonly labels: Record<string, string>;
}): boolean => {
  const identifiers = participantIdentifiers(params.thread);
  const normalizedIdentifiers = identifiers.map(normalizeIdentifier).filter(Boolean);
  const labels = normalizedIdentifiers.map(identifier => params.labels[identifier]).filter(Boolean);
  const query = params.query?.trim().toLowerCase();

  if (params.recipientIdentifiers.size > 0) {
    const normalizedSet = new Set(normalizedIdentifiers);
    const hasAllRecipients = [...params.recipientIdentifiers].every(identifier =>
      normalizedSet.has(identifier)
    );
    if (hasAllRecipients) return true;
  }

  if (params.contactIdentifiers.size > 0) {
    const normalizedSet = new Set(normalizedIdentifiers);
    if ([...params.contactIdentifiers].some(identifier => normalizedSet.has(identifier)))
      return true;
  }

  if (!query) return false;
  const searchable = [
    optionalString(params.thread.title),
    optionalString(params.thread.id),
    ...identifiers,
    ...labels,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
  return searchable.includes(query);
};

const scanThreads = async (params: {
  readonly input: Record<string, unknown>;
  readonly context: LocalExecutionContext;
  readonly query?: string;
  readonly recipients?: ReadonlyArray<string>;
  readonly maxPages?: number;
  readonly resolveContactNames?: boolean;
}): Promise<{
  readonly matches: ReadonlyArray<Record<string, unknown>>;
  readonly pagesScanned: number;
  readonly nextBefore?: string;
  readonly hasMore: boolean;
  readonly contactLookup?: ContactLookupResult;
  readonly labels: Record<string, string>;
}> => {
  const maxPages = Math.min(
    Math.max(1, Number(params.maxPages ?? THREAD_SCAN_DEFAULT_MAX_PAGES)),
    THREAD_SCAN_MAX_PAGES
  );
  const recipients = params.recipients ?? [];
  const recipientIdentifiers = new Set(recipients.map(normalizeIdentifier).filter(Boolean));
  const contactLookup =
    params.resolveContactNames && params.query
      ? await lookupContacts('query', { query: params.query })
      : undefined;
  const contactIdentifiers = new Set(
    contactLookup ? contactIdentifiersFromMatches(contactLookup) : []
  );

  let before: string | undefined = optionalString(params.input.before);
  let hasMore = true;
  let pagesScanned = 0;
  let nextBefore: string | undefined;
  const matches: Record<string, unknown>[] = [];
  const labelTargets: Record<string, unknown>[] = [];

  while (pagesScanned < maxPages && hasMore) {
    pagesScanned += 1;
    const pageInput = { ...params.input, ...(before ? { before } : {}) };
    const page = await runImessageCli(
      'threads',
      withCursorArgs(pageInput, []),
      pageInput,
      params.context
    );
    const result = isRecord(page.result) ? page.result : {};
    const threads = extractPageItems(result);
    labelTargets.push(...threads);
    const labels = await labelsForThreads(threads, params.resolveContactNames ?? true);
    matches.push(
      ...threads.filter(thread =>
        threadMatches({
          thread,
          query: params.query,
          recipientIdentifiers,
          contactIdentifiers,
          labels,
        })
      )
    );
    hasMore = result.hasMore === true;
    nextBefore = optionalString(result.oldestCursor);
    before = nextBefore;
    if (!before) break;
  }

  const labels = await labelsForThreads(labelTargets, params.resolveContactNames ?? true);
  return { matches, pagesScanned, nextBefore, hasMore, contactLookup, labels };
};

const commandTool = <TInput extends z.ZodTypeAny>(definition: {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly inputParams: TInput;
  readonly command: string;
  readonly args: (input: z.infer<TInput>) => ReadonlyArray<string>;
}): LocalToolDeclaration<TInput> => ({
  slug: definition.slug,
  name: definition.name,
  description: definition.description,
  platforms: ['darwin-arm64'],
  inputParams: definition.inputParams,
  outputParams: cliOutput,
  execution: {
    kind: 'native',
    execute: (input, context) =>
      runImessageCli(definition.command, definition.args(input as z.infer<TInput>), input, context),
  },
});

const nativeTool = <TInput extends z.ZodTypeAny>(definition: {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly inputParams: TInput;
  readonly execute: (
    input: z.infer<TInput>,
    context: LocalExecutionContext
  ) => Promise<LocalExecutionResult>;
}): LocalToolDeclaration<TInput> => ({
  slug: definition.slug,
  name: definition.name,
  description: definition.description,
  platforms: ['darwin-arm64'],
  inputParams: definition.inputParams,
  outputParams: cliOutput,
  execution: {
    kind: 'native',
    execute: (input, context) => definition.execute(input as z.infer<TInput>, context),
  },
});

const threadId = z
  .string()
  .min(1)
  .describe('platform-imessage chat/thread ID, e.g. any;-;user@example.com.');
const messageId = z.string().min(1).describe('platform-imessage message ID.');
const text = z.string().min(1).describe('Message text.');
const filePath = z.string().min(1).describe('Local file path to attach.');

const listThreadsInput = baseInput.merge(cursorInput).extend({
  compact: z
    .boolean()
    .default(true)
    .describe(
      'Return a compact thread shape with id/title/type/participant labels/lastMessage/pageInfo. Set false to return the raw upstream CLI response.'
    ),
  includeRaw: z
    .boolean()
    .default(false)
    .describe('When compact=true, include the raw upstream thread page under result.raw.'),
  resolveContactNames: z
    .boolean()
    .default(true)
    .describe('Best-effort macOS Contacts lookup for participant labels in compact output.'),
});

const findThreadInput = baseInput.extend({
  query: z
    .string()
    .min(1)
    .optional()
    .describe('Contact name, phone/email, thread title, or participant identifier to search for.'),
  recipients: z
    .array(z.string().min(1))
    .optional()
    .describe('Phone numbers or emails that must be present in the thread participants.'),
  maxPages: z
    .number()
    .int()
    .positive()
    .max(THREAD_SCAN_MAX_PAGES)
    .default(THREAD_SCAN_DEFAULT_MAX_PAGES)
    .describe('Maximum 25-thread pages to scan.'),
  compact: z.boolean().default(true).describe('Return compact thread matches.'),
  resolveContactNames: z
    .boolean()
    .default(true)
    .describe(
      'Best-effort macOS Contacts lookup so names like “Mustafa” can resolve to phone/email participants.'
    ),
});

const sendVerificationInput = {
  verifySent: z
    .boolean()
    .default(true)
    .describe(
      'After the send command succeeds, poll the local Messages DB for the newly sent message.'
    ),
  verificationTimeoutMs: z
    .number()
    .int()
    .min(0)
    .max(30_000)
    .default(SEND_VERIFY_TIMEOUT_MS)
    .describe(
      'How long to poll for the sent message before returning command_succeeded_but_not_observed.'
    ),
};

const reactionInput = primaryInstanceInput.extend({
  threadId,
  messageId,
  reaction: z
    .string()
    .min(1)
    .describe(
      'Reaction key or emoji. Standard keys: heart, like, dislike, laugh, emphasize, question.'
    ),
  prepareTranscript: z
    .boolean()
    .default(true)
    .describe('Run select-thread before reacting so the transcript is visible for UI automation.'),
  prepareTimeoutMs: z
    .number()
    .int()
    .positive()
    .max(30_000)
    .default(REACTION_PREPARE_TIMEOUT_MS)
    .describe('Timeout for select-thread transcript preparation.'),
  reactionTimeoutMs: z
    .number()
    .int()
    .positive()
    .max(60_000)
    .default(REACTION_TIMEOUT_MS)
    .describe('Timeout for the reaction command itself.'),
});

const sendMessageInput = baseInput.extend({ threadId, text, ...sendVerificationInput });

const createThreadAndSendInput = baseInput.extend({
  recipients: z.array(z.string().min(1)).min(1).describe('Recipient phone numbers or emails.'),
  message: text,
  ...sendVerificationInput,
});

export const beeperImessageToolkit: LocalToolkitDeclaration = {
  slug: 'BEEPER_IMESSAGE',
  name: 'Beeper iMessage (local)',
  description:
    'Local macOS iMessage tools backed by Beeper platform-imessage imessage-cli. Reads ~/Library/Messages and automates Messages.app for send/reaction/chat mutations.',
  platforms: ['darwin-arm64'],
  source: {
    type: 'cli',
    repository: 'https://github.com/ComposioHQ/platform-imessage',
    command: 'imessage-cli',
  },
  bundledBinaries: [
    {
      id: IMESSAGE_CLI_BINARY_ID,
      description: `Beeper platform-imessage imessage-cli ${IMESSAGE_CLI_VERSION}.`,
      targets: [
        {
          platforms: ['darwin-arm64'],
          path: 'beeper-imessage/darwin-arm64/imessage-cli',
        },
      ],
    },
  ],
  setup: {
    install:
      'The CLI ships a bundled imessage-cli binary built from the ts/packages/cli-local-tools/vendor/platform-imessage submodule. Alternatively install/build imessage-cli and set a command override in ~/composio/local_tools.json.',
    commandOverrides: [
      'composio local-tools configure BEEPER_IMESSAGE --command /path/to/imessage-cli',
    ],
    notes: [
      'Requires macOS with Messages.app configured for iMessage.',
      'Read-only tools require Messages Data access. Mutating tools require Messages Data and Accessibility; some setup flows may also request Contacts or Automation.',
      'Run LOCAL_BEEPER_IMESSAGE_AUTHORIZE (or imessage-cli authorize) to inspect/request permissions. A future local-tool auth abstraction should route this through composio link BEEPER_IMESSAGE.',
      'Most read/send tools work with the secondary Messages instance. Reaction tools default to the primary instance and prepare the transcript because upstream UI automation requires a visible reply transcript.',
    ],
  },
  tools: [
    commandTool({
      slug: 'VERSION',
      name: 'Get imessage-cli version',
      description:
        'Print the bundled Beeper platform-imessage CLI version without touching Messages.app.',
      inputParams: baseInput,
      command: 'version',
      args: () => [],
    }),
    commandTool({
      slug: 'AUTHORIZE',
      name: 'Inspect or request iMessage local permissions',
      description:
        'Run imessage-cli authorize for Accessibility, Contacts, Messages Data, and Automation permissions. This may open macOS prompts or System Settings. This is the local equivalent of linking/authorizing the iMessage toolkit.',
      inputParams: baseInput.extend({
        target: z
          .enum(['all', 'accessibility', 'contacts', 'messages-data', 'automation'])
          .default('all')
          .describe('Permission target to inspect/request.'),
      }),
      command: 'authorize',
      args: input => [input.target],
    }),
    commandTool({
      slug: 'CURRENT_USER',
      name: 'Get current iMessage user',
      description:
        'Return the iMessage identity known to the local platform-imessage backend. Requires Messages Data access.',
      inputParams: baseInput,
      command: 'current-user',
      args: () => [],
    }),
    nativeTool({
      slug: 'LIST_THREADS',
      name: 'List iMessage threads',
      description:
        'List normal-inbox iMessage chats from the local Messages database. Defaults to compact output with pageInfo.nextBefore for pagination; set compact=false for raw upstream output.',
      inputParams: listThreadsInput,
      execute: async (input, context) => {
        const raw = await runImessageCli('threads', withCursorArgs(input, []), input, context);
        return compactThreadsResult(raw, {
          compact: input.compact,
          includeRaw: input.includeRaw,
          resolveContactNames: input.resolveContactNames,
        });
      },
    }),
    nativeTool({
      slug: 'FIND_THREAD',
      name: 'Find iMessage thread',
      description:
        'Find threads by contact name, phone/email, thread title, or participants without doing a manual LIST_THREADS pagination/filter dance.',
      inputParams: findThreadInput,
      execute: async (input, context) => {
        if (!input.query && (!input.recipients || input.recipients.length === 0)) {
          throw new Error('Provide query or recipients to find an iMessage thread.');
        }
        const scan = await scanThreads({
          input,
          context,
          query: input.query,
          recipients: input.recipients,
          maxPages: input.maxPages,
          resolveContactNames: input.resolveContactNames,
        });
        const result = {
          items: input.compact
            ? scan.matches.map(thread => compactThread(thread, scan.labels))
            : scan.matches,
          pageInfo: {
            pagesScanned: scan.pagesScanned,
            hasMore: scan.hasMore,
            nextBefore: scan.nextBefore,
          },
          contactResolution: {
            enabled: input.resolveContactNames,
            matchedContacts: scan.contactLookup?.matches.length ?? 0,
            error: scan.contactLookup?.error,
          },
        };
        return {
          ok: true,
          commandName: 'find-thread',
          result,
          resultText: JSON.stringify(result, null, 2),
          stdout: '',
          stderr: '',
        };
      },
    }),
    commandTool({
      slug: 'GET_THREAD',
      name: 'Get iMessage thread',
      description: 'Fetch a single iMessage chat/thread by platform-imessage thread ID.',
      inputParams: baseInput.extend({ threadId }),
      command: 'thread',
      args: input => [input.threadId],
    }),
    commandTool({
      slug: 'LIST_MESSAGES',
      name: 'List iMessage messages',
      description:
        'List messages in a chat from the local Messages database, optionally using cursors.',
      inputParams: baseInput.merge(cursorInput).extend({ threadId }),
      command: 'messages',
      args: input => withCursorArgs(input, [input.threadId]),
    }),
    commandTool({
      slug: 'GET_MESSAGE',
      name: 'Get iMessage message',
      description: 'Fetch a single message by chat/thread ID and message ID.',
      inputParams: baseInput.extend({ threadId, messageId }),
      command: 'message',
      args: input => [input.threadId, input.messageId],
    }),
    nativeTool({
      slug: 'SEARCH_MESSAGES',
      name: 'Search local iMessage messages',
      description:
        'Search local iMessage messages by text and, by default, also search thread participants/contact names so queries like “Nikos” can find matching chats.',
      inputParams: baseInput.extend({
        query: z
          .string()
          .min(1)
          .describe('Text, participant name, phone/email, or thread title to search for.'),
        includeThreadMatches: z
          .boolean()
          .default(true)
          .describe(
            'Also scan threads/participants/contact names in addition to upstream message text search.'
          ),
        maxThreadPages: z
          .number()
          .int()
          .positive()
          .max(THREAD_SCAN_MAX_PAGES)
          .default(THREAD_SCAN_DEFAULT_MAX_PAGES)
          .describe('Maximum 25-thread pages to scan when includeThreadMatches=true.'),
        compactThreads: z
          .boolean()
          .default(true)
          .describe('Return compact matching thread records.'),
        resolveContactNames: z
          .boolean()
          .default(true)
          .describe('Best-effort macOS Contacts lookup for participant/name matching.'),
      }),
      execute: async (input, context) => {
        const searchResult = await runImessageCli('search', [input.query], input, context);
        const threadScan = input.includeThreadMatches
          ? await scanThreads({
              input,
              context,
              query: input.query,
              maxPages: input.maxThreadPages,
              resolveContactNames: input.resolveContactNames,
            })
          : undefined;
        const result = {
          messageSearch: searchResult.result,
          matchingThreads: threadScan
            ? input.compactThreads
              ? threadScan.matches.map(thread => compactThread(thread, threadScan.labels))
              : threadScan.matches
            : [],
          threadSearch: threadScan
            ? {
                pagesScanned: threadScan.pagesScanned,
                hasMore: threadScan.hasMore,
                nextBefore: threadScan.nextBefore,
                contactResolution: {
                  enabled: input.resolveContactNames,
                  matchedContacts: threadScan.contactLookup?.matches.length ?? 0,
                  error: threadScan.contactLookup?.error,
                },
              }
            : { enabled: false },
        };
        return {
          ...searchResult,
          result,
          resultText: JSON.stringify(result, null, 2),
        };
      },
    }),
    nativeTool({
      slug: 'CREATE_THREAD_AND_SEND',
      name: 'Create iMessage thread and send message',
      description:
        'Create or resolve a chat for one or more recipients and send the initial message. After the send command succeeds, this verifies the newly sent message and returns sentMessage/sentMessageId to avoid stale existing-thread ambiguity.',
      inputParams: createThreadAndSendInput,
      execute: async (input, context) => {
        const createResult = await runImessageCli(
          'create-thread',
          [...stringArray(input.recipients), '--message', input.message],
          input,
          context
        );
        const threadId = extractThreadId(createResult.result);
        const verification =
          input.verifySent && threadId
            ? await pollForSentMessage({
                threadId,
                text: input.message,
                input,
                context,
                timeoutMs: input.verificationTimeoutMs,
              })
            : { attempts: 0 };
        return enhanceSendResult({
          commandResult: createResult,
          threadId,
          sentText: input.message,
          sentMessage: verification.message,
          messagesResult: verification.messagesResult,
          attempts: verification.attempts,
          verify: input.verifySent,
        });
      },
    }),
    nativeTool({
      slug: 'SEND_MESSAGE',
      name: 'Send iMessage text',
      description:
        'Send a text message to an existing chat/thread. Returns sendVerification plus sentMessage/sentMessageId when the local DB observes the new message, so callers should not retry solely because a thread preview is stale.',
      inputParams: sendMessageInput,
      execute: async (input, context) => {
        const beforeMessages = input.verifySent
          ? await fetchMessages(input.threadId, input, context)
          : undefined;
        const excludeMessageIds = new Set(
          extractPageItems(beforeMessages?.result)
            .map(messageIdOf)
            .filter((value): value is string => Boolean(value))
        );
        const sendResult = await runImessageCli(
          'send',
          [input.threadId, input.text],
          input,
          context
        );
        const verification = input.verifySent
          ? await pollForSentMessage({
              threadId: input.threadId,
              text: input.text,
              input,
              context,
              timeoutMs: input.verificationTimeoutMs,
              excludeMessageIds,
            })
          : { attempts: 0 };
        return enhanceSendResult({
          commandResult: sendResult,
          threadId: input.threadId,
          sentText: input.text,
          sentMessage: verification.message,
          messagesResult: verification.messagesResult,
          attempts: verification.attempts,
          verify: input.verifySent,
        });
      },
    }),
    commandTool({
      slug: 'REPLY_TO_MESSAGE',
      name: 'Reply to iMessage message',
      description: 'Reply to a specific iMessage with text. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId, messageId, text }),
      command: 'reply',
      args: input => [input.threadId, input.messageId, input.text],
    }),
    commandTool({
      slug: 'SEND_FILE',
      name: 'Send iMessage file attachment',
      description:
        'Send a local file attachment to an existing chat/thread. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId, filePath }),
      command: 'send-file',
      args: input => [input.threadId, absolutePath(input.filePath)],
    }),
    commandTool({
      slug: 'REPLY_WITH_FILE',
      name: 'Reply to iMessage with file attachment',
      description:
        'Reply to a specific message with a local file attachment. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId, messageId, filePath }),
      command: 'reply-file',
      args: input => [input.threadId, input.messageId, absolutePath(input.filePath)],
    }),
    commandTool({
      slug: 'EDIT_MESSAGE',
      name: 'Edit sent iMessage',
      description:
        'Edit a previously sent iMessage. Supported by upstream on macOS Ventura or later.',
      inputParams: baseInput.extend({ threadId, messageId, text }),
      command: 'edit',
      args: input => [input.threadId, input.messageId, input.text],
    }),
    commandTool({
      slug: 'UNDO_SEND',
      name: 'Undo sent iMessage',
      description:
        'Undo send for a previously sent iMessage. Upstream supports this on macOS Ventura or later within the Messages time limit.',
      inputParams: baseInput.extend({ threadId, messageId }),
      command: 'undo-send',
      args: input => [input.threadId, input.messageId],
    }),
    nativeTool({
      slug: 'REACT_TO_MESSAGE',
      name: 'React to iMessage',
      description:
        'Add a standard reaction to a message using a supported key or emoji. Defaults to the primary Messages.app instance and runs select-thread first because upstream reaction automation needs a visible transcript.',
      inputParams: reactionInput,
      execute: async (input, context) => {
        const effectiveInput = { ...input, useSecondaryInstance: input.useSecondaryInstance };
        if (input.prepareTranscript) {
          await runImessageCli('select-thread', [input.threadId], effectiveInput, context, {
            timeoutMs: input.prepareTimeoutMs,
          });
        }
        return runImessageCli(
          'react',
          [input.threadId, input.messageId, input.reaction],
          effectiveInput,
          context,
          { timeoutMs: input.reactionTimeoutMs }
        );
      },
    }),
    nativeTool({
      slug: 'UNREACT_FROM_MESSAGE',
      name: 'Remove iMessage reaction',
      description:
        'Remove a standard reaction from a message. Defaults to the primary Messages.app instance and runs select-thread first because upstream reaction automation needs a visible transcript.',
      inputParams: reactionInput,
      execute: async (input, context) => {
        const effectiveInput = { ...input, useSecondaryInstance: input.useSecondaryInstance };
        if (input.prepareTranscript) {
          await runImessageCli('select-thread', [input.threadId], effectiveInput, context, {
            timeoutMs: input.prepareTimeoutMs,
          });
        }
        return runImessageCli(
          'unreact',
          [input.threadId, input.messageId, input.reaction],
          effectiveInput,
          context,
          { timeoutMs: input.reactionTimeoutMs }
        );
      },
    }),
    commandTool({
      slug: 'MARK_READ',
      name: 'Mark iMessage thread read',
      description:
        'Mark a chat/thread as read by sending a read receipt. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId }),
      command: 'mark-read',
      args: input => [input.threadId],
    }),
    commandTool({
      slug: 'MARK_UNREAD',
      name: 'Mark iMessage thread unread',
      description: 'Mark a chat/thread as unread. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId }),
      command: 'mark-unread',
      args: input => [input.threadId],
    }),
    commandTool({
      slug: 'MUTE_THREAD',
      name: 'Mute iMessage thread',
      description: 'Mute a chat/thread indefinitely. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId }),
      command: 'mute',
      args: input => [input.threadId],
    }),
    commandTool({
      slug: 'UNMUTE_THREAD',
      name: 'Unmute iMessage thread',
      description: 'Unmute a chat/thread. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId }),
      command: 'unmute',
      args: input => [input.threadId],
    }),
    commandTool({
      slug: 'SEND_TYPING_STATUS',
      name: 'Send iMessage typing status',
      description: 'Send typing on/off status for a chat/thread. Mutates real Messages state.',
      inputParams: baseInput.extend({
        threadId,
        status: z.enum(['on', 'off']).describe('Typing status to send.'),
      }),
      command: 'typing',
      args: input => [input.threadId, input.status],
    }),
    commandTool({
      slug: 'NOTIFY_ANYWAY',
      name: 'Notify anyway for iMessage thread',
      description:
        'Trigger the Messages "notify anyway" action for a chat/thread. Mutates real Messages state.',
      inputParams: baseInput.extend({ threadId }),
      command: 'notify-anyway',
      args: input => [input.threadId],
    }),
    commandTool({
      slug: 'DELETE_THREAD',
      name: 'Delete iMessage thread',
      description:
        'Delete a chat/thread from Messages. Requires confirm=true because this mutates real Messages state.',
      inputParams: baseInput.extend({
        threadId,
        confirm: z.literal(true).describe('Must be true to delete the thread.'),
      }),
      command: 'delete-thread',
      args: input => [input.threadId],
    }),
  ],
};
