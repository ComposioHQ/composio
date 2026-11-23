const PLAIN_URL = 'https://core-api.uk.plain.com/graphql/v1';
const ALLOWED_ERROR_CODES = new Set([
  'FORBIDDEN',
  'UNAUTHENTICATED',
  'RATE_LIMITED',
  'BAD_USER_INPUT',
  'GRAPHQL_PARSE_FAILED',
  'GRAPHQL_VALIDATION_FAILED',
  'INTERNAL_SERVER_ERROR',
]);

export type PlainIssue = {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly htmlUrl: string;
  readonly author: { readonly login: string; readonly id?: number; readonly email?: string | null; readonly name?: string | null };
};
export type PlainOptions = { readonly apiKey: string; readonly timeoutMs?: number; readonly fetchFn?: typeof fetch };
export type PlainThread = { readonly id: string; readonly ref?: string };

async function plainGraphql<T>(query: string, variables: Record<string, unknown>, options: PlainOptions): Promise<T> {
  if (!options.apiKey) throw new Error('PLAIN_API_KEY is not configured; support forwarding cannot complete.');
  const fetchFn = options.fetchFn ?? fetch;
  const operation = query.match(/\b(?:query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? 'unknown operation';

  const response = await fetchFn(PLAIN_URL, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  let json: { data?: T; errors?: Array<{ extensions?: { code?: string } }> };
  try {
    json = (await response.json()) as typeof json;
  } catch {
    throw new Error(`Plain API request failed during ${operation} (HTTP ${response.status}; invalid JSON response).`);
  }
  if (!response.ok || json.errors) {
    // Response messages can echo credentials, issue text, or customer data.
    const codes = Array.isArray(json.errors)
      ? [...new Set(json.errors.map(e => e?.extensions?.code).filter((c): c is string => Boolean(c && ALLOWED_ERROR_CODES.has(c))))]
      : [];
    const detail = codes.length ? codes.join(', ') : json.errors ? 'unrecognized GraphQL error' : 'HTTP request rejected';
    throw new Error(`Plain API request failed during ${operation} (HTTP ${response.status}; ${detail}).`);
  }
  if (!json.data) throw new Error(`Plain API returned no data during ${operation}.`);
  return json.data;
}

export async function forwardIssueToPlain(issue: PlainIssue, options: PlainOptions): Promise<PlainThread> {
  const externalId = `github:${issue.owner}/${issue.repo}:issues/${issue.number}`;
  const existing = await plainGraphql<{ threadsByExternalId?: { edges?: Array<{ node?: PlainThread }> } }>(
    'query supportThread($externalId: ID!) { threadsByExternalId(externalId: $externalId, first: 1) { edges { node { id ref } } } }',
    { externalId },
    options
  );
  const edges = existing.threadsByExternalId?.edges;
  if (!Array.isArray(edges)) throw new Error('Plain thread lookup returned an invalid response.');
  if (edges.length > 0) {
    if (!edges[0].node?.id) throw new Error('Plain thread lookup returned no thread ID.');
    return edges[0].node;
  }

  const login = issue.author.login || 'unknown';
  const email =
    issue.author.email ||
    (issue.author.id ? `${issue.author.id}+${login}@users.noreply.github.com` : `${login}@users.noreply.github.com`);
  const fullName = issue.author.name || login;
  const customerData = await plainGraphql<{ upsertCustomer?: { customer?: { id: string }; error?: { type?: string } } }>(
    'mutation upsertCustomer($input: UpsertCustomerInput!) { upsertCustomer(input: $input) { result customer { id } error { message type code } } }',
    {
      input: {
        identifier: { emailAddress: email },
        onCreate: { fullName, shortName: login, email: { email, isVerified: Boolean(issue.author.email) }, externalId: `github:user:${login}` },
        onUpdate: { fullName: { value: fullName }, shortName: { value: login }, externalId: { value: `github:user:${login}` } },
      },
    },
    options
  );
  const customerId = customerData.upsertCustomer?.customer?.id;
  if (!customerId) {
    throw new Error(`Could not upsert Plain support customer (${customerData.upsertCustomer?.error?.type || 'missing customer'}).`);
  }

  const body = issue.body || '_No issue body provided._';
  const plainText = [
    `GitHub issue routed as support: ${issue.htmlUrl}`,
    `Reporter: @${login}`,
    '',
    'Issue body:',
    body.length > 8000 ? `${body.slice(0, 8000)}\n\n[truncated]` : body,
  ].join('\n');

  const threadData = await plainGraphql<{ createThread?: { thread?: PlainThread; error?: { type?: string } } }>(
    'mutation createThread($input: CreateThreadInput!) { createThread(input: $input) { thread { id ref } error { message type code } } }',
    {
      input: {
        title: `[GitHub #${issue.number}] ${issue.title}`,
        customerIdentifier: { customerId },
        externalId,
        components: [{ componentText: { text: plainText } }],
      },
    },
    options
  );
  const thread = threadData.createThread?.thread;
  if (!thread?.id) {
    throw new Error(`Could not create Plain support thread (${threadData.createThread?.error?.type || 'missing thread'}).`);
  }
  return thread;
}
