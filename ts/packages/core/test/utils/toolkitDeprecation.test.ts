import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/utils/logger';
import {
  _resetToolkitDeprecationWarningsForTests,
  createToolkitDeprecationFetch,
  formatToolkitDeprecationWarnings,
  parseDeprecatedToolkitsHeader,
  TOOLKIT_DEPRECATION_DOCS_URL,
  TOOLKIT_DEPRECATION_HEADER,
  type DeprecatedToolkitEntry,
} from '../../src/utils/toolkitDeprecation';

const FULL_ITEM =
  '"GMAIL";version="20250114_00";deprecated=@1779840000;sunset=@1787788800;reason="lifecycle"';
const BARE_ITEM = '"STRAVA";version="20240902_00"';
const DOCS_URL = 'https://docs.example/deprecation';

const entry = (overrides: Partial<DeprecatedToolkitEntry> = {}): DeprecatedToolkitEntry => ({
  slug: 'GMAIL',
  version: '20250114_00',
  ...overrides,
});

describe('parseDeprecatedToolkitsHeader', () => {
  it('parses an item with every parameter', () => {
    expect(parseDeprecatedToolkitsHeader(FULL_ITEM)).toEqual([
      {
        slug: 'GMAIL',
        version: '20250114_00',
        deprecatedAt: new Date(1779840000 * 1000),
        sunsetAt: new Date(1787788800 * 1000),
        reason: 'lifecycle',
      },
    ]);
  });

  it('parses a bare item that carries only the version', () => {
    expect(parseDeprecatedToolkitsHeader(BARE_ITEM)).toEqual([
      { slug: 'STRAVA', version: '20240902_00' },
    ]);
  });

  it('parses a two item list', () => {
    const entries = parseDeprecatedToolkitsHeader(`${FULL_ITEM}, ${BARE_ITEM}`);
    expect(entries.map(item => `${item.slug}@${item.version}`)).toEqual([
      'GMAIL@20250114_00',
      'STRAVA@20240902_00',
    ]);
  });

  it('decodes escaped quotes and backslashes inside a slug', () => {
    const entries = parseDeprecatedToolkitsHeader(
      '"ODD\\"SLUG\\\\";version="20250101_00", "GMAIL";version="20250114_00"'
    );
    expect(entries.map(item => item.slug)).toEqual(['ODD"SLUG\\', 'GMAIL']);
  });

  it('tolerates whitespace around separators', () => {
    const entries = parseDeprecatedToolkitsHeader(
      '  "GMAIL" ; version = "20250114_00" ; sunset = @1787788800  ,"STRAVA";version="20240902_00"  '
    );
    expect(entries).toEqual([
      { slug: 'GMAIL', version: '20250114_00', sunsetAt: new Date(1787788800 * 1000) },
      { slug: 'STRAVA', version: '20240902_00' },
    ]);
  });

  it('returns an empty list for garbage and for an empty string', () => {
    expect(parseDeprecatedToolkitsHeader('')).toEqual([]);
    expect(parseDeprecatedToolkitsHeader('   ')).toEqual([]);
    expect(parseDeprecatedToolkitsHeader('not a structured field')).toEqual([]);
    expect(parseDeprecatedToolkitsHeader('GMAIL;version=20250114_00')).toEqual([]);
    expect(parseDeprecatedToolkitsHeader('"GMAIL";version="unterminated')).toEqual([]);
    expect(parseDeprecatedToolkitsHeader(',,,;;;===')).toEqual([]);
  });

  it('ignores unknown parameters', () => {
    expect(
      parseDeprecatedToolkitsHeader('"GMAIL";version="20250114_00";severity=3;flag;note="x"')
    ).toEqual([{ slug: 'GMAIL', version: '20250114_00' }]);
  });

  it('ignores a parameter named after an inherited object property', () => {
    expect(parseDeprecatedToolkitsHeader('"GMAIL";version="1";constructor="x"')).toEqual([
      { slug: 'GMAIL', version: '1' },
    ]);
  });

  it('drops an empty item but keeps its siblings', () => {
    expect(parseDeprecatedToolkitsHeader('"GMAIL";version="1", ;;')).toEqual([
      { slug: 'GMAIL', version: '1' },
    ]);
  });

  it('drops an item without a version but keeps its siblings', () => {
    expect(parseDeprecatedToolkitsHeader(`"GMAIL";deprecated=@1779840000, ${BARE_ITEM}`)).toEqual([
      { slug: 'STRAVA', version: '20240902_00' },
    ]);
  });

  it('drops an item whose known parameter has the wrong type', () => {
    expect(parseDeprecatedToolkitsHeader('"GMAIL";version=20250114_00')).toEqual([]);
    expect(parseDeprecatedToolkitsHeader('"GMAIL";version="1";deprecated="2026-05-27"')).toEqual(
      []
    );
    expect(parseDeprecatedToolkitsHeader('"GMAIL";version="1";reason=lifecycle')).toEqual([]);
  });

  it('rejects invalid escapes in an sf-string', () => {
    expect(parseDeprecatedToolkitsHeader('"GM\\nAIL";version="1"')).toEqual([]);
  });
});

describe('formatToolkitDeprecationWarnings', () => {
  it('renders the full message with dates and reason', () => {
    const [line] = formatToolkitDeprecationWarnings(
      parseDeprecatedToolkitsHeader(FULL_ITEM),
      DOCS_URL
    );
    expect(line).toBe(
      '[Deprecation] Toolkit GMAIL version 20250114_00 was deprecated on 2026-05-27 (lifecycle) ' +
        'and will stop working on 2026-08-27. ' +
        "Pin a newer version with toolkitVersions: { gmail: '<version>' } or " +
        `COMPOSIO_TOOLKIT_VERSION_GMAIL. See ${DOCS_URL}.`
    );
  });

  it('omits the reason and sunset clauses when the header omits them', () => {
    const [line] = formatToolkitDeprecationWarnings(
      [entry({ slug: 'STRAVA', version: '20240902_00' })],
      DOCS_URL
    );
    expect(line).toBe(
      '[Deprecation] Toolkit STRAVA version 20240902_00 was deprecated. ' +
        "Pin a newer version with toolkitVersions: { strava: '<version>' } or " +
        `COMPOSIO_TOOLKIT_VERSION_STRAVA. See ${DOCS_URL}.`
    );
  });

  it('keeps the deprecation date when only the sunset is missing', () => {
    const [line] = formatToolkitDeprecationWarnings(
      [entry({ deprecatedAt: new Date(1779840000 * 1000), reason: 'security' })],
      DOCS_URL
    );
    expect(line).toContain('was deprecated on 2026-05-27 (security). Pin');
    expect(line).not.toContain('stop working');
  });

  it('defaults to the published docs anchor', () => {
    const [line] = formatToolkitDeprecationWarnings([entry()]);
    expect(line).toContain(`See ${TOOLKIT_DEPRECATION_DOCS_URL}.`);
    expect(TOOLKIT_DEPRECATION_DOCS_URL).toBe(
      'https://docs.composio.dev/docs/tools-direct/toolkit-versioning#deprecation-and-sunset'
    );
  });

  it('groups six versions of one slug into one line naming five', () => {
    const entries = ['01', '02', '03', '04', '05', '06'].map(suffix =>
      entry({
        version: `202501${suffix}_00`,
        sunsetAt: new Date(Date.UTC(2026, 7, Number(suffix) + 20)),
      })
    );
    const lines = formatToolkitDeprecationWarnings(entries, DOCS_URL);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      '[Deprecation] Toolkit GMAIL versions 20250101_00, 20250102_00, 20250103_00, 20250104_00, ' +
        '20250105_00 and 1 more are deprecated and the earliest will stop working on 2026-08-21. ' +
        "Pin a newer version with toolkitVersions: { gmail: '<version>' } or " +
        `COMPOSIO_TOOLKIT_VERSION_GMAIL. See ${DOCS_URL}.`
    );
  });

  it('renders one line per slug, grouping case-insensitively', () => {
    const lines = formatToolkitDeprecationWarnings(
      [
        entry({ slug: 'GMAIL', version: '1' }),
        entry({ slug: 'STRAVA', version: '1' }),
        entry({ slug: 'gmail', version: '2' }),
      ],
      DOCS_URL
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Toolkit GMAIL versions 1, 2 are deprecated.');
    expect(lines[1]).toContain('Toolkit STRAVA version 1 was deprecated.');
  });

  it('returns no lines for no entries', () => {
    expect(formatToolkitDeprecationWarnings([], DOCS_URL)).toEqual([]);
  });
});

describe('createToolkitDeprecationFetch', () => {
  const response = (headers: Record<string, string> = {}): Response =>
    new Response('{"ok":true}', { status: 200, headers });

  beforeEach(() => {
    _resetToolkitDeprecationWarningsForTests();
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetToolkitDeprecationWarningsForTests();
  });

  it('warns once per toolkit version across calls and returns the response unchanged', async () => {
    const base = vi.fn(async () => response({ [TOOLKIT_DEPRECATION_HEADER]: FULL_ITEM }));
    const wrapped = createToolkitDeprecationFetch(base);

    const first = await wrapped('https://backend.composio.test/api/v3/toolkits/gmail');
    const second = await wrapped('https://backend.composio.test/api/v3/toolkits/gmail');

    expect(base).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(logger.warn).mock.calls[0]?.[0])).toContain(
      'GMAIL version 20250114_00'
    );
    expect(await first.json()).toEqual({ ok: true });
    expect(await second.json()).toEqual({ ok: true });
  });

  it('matches the header name case-insensitively', async () => {
    const wrapped = createToolkitDeprecationFetch(async () =>
      response({ 'Composio-Deprecated-Toolkits': BARE_ITEM })
    );
    await wrapped('https://backend.composio.test/api/v3/toolkits/strava');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('warns for a second toolkit version even after the first was deduped', async () => {
    const wrapped = createToolkitDeprecationFetch(async () =>
      response({ [TOOLKIT_DEPRECATION_HEADER]: `${FULL_ITEM}, ${BARE_ITEM}` })
    );
    await wrapped('https://backend.composio.test/a');
    expect(logger.warn).toHaveBeenCalledTimes(2);

    const next = createToolkitDeprecationFetch(async () =>
      response({ [TOOLKIT_DEPRECATION_HEADER]: '"GMAIL";version="20250201_00"' })
    );
    await next('https://backend.composio.test/b');
    expect(logger.warn).toHaveBeenCalledTimes(3);
  });

  it('does nothing without the header and swallows a malformed value', async () => {
    const plain = createToolkitDeprecationFetch(async () => response());
    const garbage = createToolkitDeprecationFetch(async () =>
      response({ [TOOLKIT_DEPRECATION_HEADER]: '%%% nope' })
    );
    expect(await (await plain('https://backend.composio.test/a')).json()).toEqual({ ok: true });
    expect(await (await garbage('https://backend.composio.test/b')).json()).toEqual({ ok: true });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns again after the test reset helper clears the record', async () => {
    const wrapped = createToolkitDeprecationFetch(async () =>
      response({ [TOOLKIT_DEPRECATION_HEADER]: BARE_ITEM })
    );
    await wrapped('https://backend.composio.test/a');
    _resetToolkitDeprecationWarningsForTests();
    await wrapped('https://backend.composio.test/a');
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('resolves the global fetch per call when no base fetch is given', async () => {
    const wrapped = createToolkitDeprecationFetch();
    const stub = vi.fn(async () => response({ [TOOLKIT_DEPRECATION_HEADER]: BARE_ITEM }));
    vi.stubGlobal('fetch', stub);
    try {
      const result = await wrapped('https://backend.composio.test/a', { method: 'GET' });
      expect(stub).toHaveBeenCalledWith('https://backend.composio.test/a', { method: 'GET' });
      expect(result.status).toBe(200);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('propagates a rejection from the underlying fetch untouched', async () => {
    const failure = new TypeError('fetch failed');
    const wrapped = createToolkitDeprecationFetch(async () => {
      throw failure;
    });
    await expect(wrapped('https://backend.composio.test/a')).rejects.toBe(failure);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('ignores a header longer than 2048 characters and still returns the body', async () => {
    const oversized = `"GMAIL";version="1";reason="${'x'.repeat(2048)}"`;
    const wrapped = createToolkitDeprecationFetch(async () =>
      response({ [TOOLKIT_DEPRECATION_HEADER]: oversized })
    );
    const result = await wrapped('https://backend.composio.test/a');
    expect(await result.json()).toEqual({ ok: true });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('ignores a header carrying a control character and still returns the body', async () => {
    const wrapped = createToolkitDeprecationFetch(async () =>
      response({ [TOOLKIT_DEPRECATION_HEADER]: '"GMAIL";version="1";reason="\u001b[2J"' })
    );
    const result = await wrapped('https://backend.composio.test/a');
    expect(await result.json()).toEqual({ ok: true });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('stops recording new versions after 1024 keys without evicting the old ones', async () => {
    let version = 0;
    const wrapped = createToolkitDeprecationFetch(async () =>
      response({ [TOOLKIT_DEPRECATION_HEADER]: `"GMAIL";version="${version}"` })
    );
    const send = async (next: number) => {
      version = next;
      await wrapped('https://backend.composio.test/a');
    };

    for (let next = 1; next <= 1024; next++) await send(next);
    expect(logger.warn).toHaveBeenCalledTimes(1024);

    await send(1025);
    expect(logger.warn).toHaveBeenCalledTimes(1024);

    for (let next = 1; next <= 1024; next++) await send(next);
    expect(logger.warn).toHaveBeenCalledTimes(1024);
  });

  it('still resolves when the logger sink throws from both warn and debug', async () => {
    vi.restoreAllMocks();
    const throwing = () => {
      throw new Error('sink is broken');
    };
    const sink = { error: vi.fn(), warn: vi.fn(throwing), info: vi.fn(), debug: vi.fn(throwing) };
    logger.configure({ level: 'debug', sink });
    const wrapped = createToolkitDeprecationFetch(async () =>
      response({ [TOOLKIT_DEPRECATION_HEADER]: BARE_ITEM })
    );
    try {
      const result = await wrapped('https://backend.composio.test/a');
      expect(await result.json()).toEqual({ ok: true });
      expect(sink.warn).toHaveBeenCalledTimes(1);
      expect(sink.debug).toHaveBeenCalledTimes(1);
    } finally {
      logger.configure({ level: 'info', sink: console });
    }
  });

  it('logs at debug and still returns the response when inspecting the header throws', async () => {
    const broken = response({ [TOOLKIT_DEPRECATION_HEADER]: BARE_ITEM });
    Object.defineProperty(broken, 'headers', {
      get() {
        throw new Error('headers unavailable');
      },
    });
    const wrapped = createToolkitDeprecationFetch(async () => broken);
    const result = await wrapped('https://backend.composio.test/a');
    expect(result).toBe(broken);
    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
