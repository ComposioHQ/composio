/**
 * Cross-provider `$ref` handling contract.
 *
 * The original bug was not that one provider mishandled `$ref` — it was that
 * *six* did, silently, for months, because nothing enumerated the providers and
 * asked the question. Two separate fixes (mastra, then anthropic) each solved it
 * locally and neither surfaced the rest.
 *
 * This test enumerates every provider in the repo and requires each one to be
 * classified below. Adding provider #11 without a classification fails the
 * suite. That is the whole point: the taxonomy stops being tribal knowledge and
 * becomes a build gate.
 *
 * It reads source text rather than importing the providers — importing all ten
 * would drag in every vendor SDK as a test dependency of `@composio/core`. The
 * behavioral assertions live in each provider's own package (see
 * `providers/openai-agents/test/openai-agents-ref-schemas.test.ts`); this test
 * owns *completeness*.
 *
 * Regenerated 2026-08-28 from its Python counterpart
 * (`python/tests/test_provider_ref_contract.py`) after the original was lost in
 * a session handoff; the original ratchets (`pending-plan-003`) were retired
 * when the fix landed on `fix/deref-ref-schemas-in-providers`.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** ts/packages/core/test/providers -> ts/packages */
const packagesDir = path.resolve(here, '../../..');
/** ts/packages -> repo root */
const repoRoot = path.resolve(packagesDir, '../..');
const providersDir = path.join(packagesDir, 'providers');

/** A provider is "dereferencing" if its source calls this. */
const DEREF_MARK = 'dereferenceJsonSchema';

/**
 * How each provider treats a tool's input schema.
 *
 * - `needs-deref`: the provider rebuilds the schema root from
 *   `properties`/`required`, or converts to Zod. Either way a `$ref` cannot
 *   survive intact, so the schema must be dereferenced first.
 * - `passthrough`: the provider forwards the schema object whole. `$defs`
 *   travels with `$ref` and the vendor resolves it. Dereferencing here would
 *   cost tokens and, for vendors that support recursion, remove capability.
 *
 * `status` exists only for `needs-deref` entries that are not fixed yet; today
 * there are none, but the ratchet below stays so the mechanism does not rot.
 */
type Treatment = 'needs-deref' | 'passthrough';

interface Classification {
  treatment: Treatment;
  /** Present only while a needs-deref provider is known-broken. */
  status?: `pending-plan-${string}`;
  /** Why this provider is classified the way it is. */
  reason: string;
}

const PROVIDER_PACKAGES: Record<string, Classification> = {
  anthropic: {
    treatment: 'needs-deref',
    reason: 'sanitizes property keys, which requires keys behind a ref to be materialized',
  },
  mastra: {
    treatment: 'needs-deref',
    reason:
      '@mastra/schema-compat (AJV) refuses unresolved $ref; its converter degrades refs to permissive anyOf',
  },
  langchain: {
    treatment: 'needs-deref',
    reason: 'converts to Zod; the converter has no $ref branch (degrades to z.any())',
  },
  llamaindex: {
    treatment: 'needs-deref',
    reason: 'converts to Zod; the converter has no $ref branch (degrades to z.any())',
  },
  'claude-agent-sdk': {
    treatment: 'needs-deref',
    reason: 'converts to Zod; the converter has no $ref branch (degrades to z.any())',
  },
  vercel: {
    treatment: 'needs-deref',
    reason: 'converts to Zod on every path, not just the strict rewrite',
  },
  google: {
    treatment: 'needs-deref',
    reason:
      'rebuilds the root from properties/required; the @google/genai Schema proto has no ref/defs field',
  },
  'openai-agents': {
    treatment: 'needs-deref',
    reason:
      'non-strict fallback rebuilds the root; the strict branch keeps refs on purpose (OpenAI resolves them natively)',
  },
  openai: {
    treatment: 'passthrough',
    reason:
      'forwards the whole schema; OpenAI resolves $defs/$ref natively (strict mode asserts this)',
  },
  cloudflare: {
    treatment: 'passthrough',
    reason: 'forwards the whole schema',
  },
};

/** Non-`providers/` sources that also hand schemas to vendors. */
const EXTRA_PASSTHROUGH_SOURCES: Record<string, string> = {
  'ts/packages/core/src/provider/OpenAIProvider.ts': 'forwards the whole schema',
  'ts/packages/experimental/src/eve/provider.ts': 'forwards the whole schema',
};

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function packageText(provider: string): string {
  return listSourceFiles(path.join(providersDir, provider, 'src'))
    .map(file => readFileSync(file, 'utf8'))
    .join('\n');
}

const DISCOVERED = readdirSync(providersDir).filter(
  entry =>
    statSync(path.join(providersDir, entry)).isDirectory() &&
    existsSync(path.join(providersDir, entry, 'package.json')) &&
    existsSync(path.join(providersDir, entry, 'src'))
);

describe('cross-provider $ref handling contract', () => {
  it('discovers the provider packages', () => {
    // Guards the test itself: a broken path would make everything below
    // vacuously pass.
    expect(DISCOVERED.length).toBeGreaterThanOrEqual(10);
  });

  it('classifies every provider package', () => {
    const unclassified = DISCOVERED.filter(name => !(name in PROVIDER_PACKAGES));
    expect(unclassified).toEqual([]);
  });

  it('does not classify providers that no longer exist', () => {
    const stale = Object.keys(PROVIDER_PACKAGES).filter(name => !DISCOVERED.includes(name));
    expect(stale).toEqual([]);
  });

  describe.each(Object.entries(PROVIDER_PACKAGES).filter(([, c]) => c.treatment === 'needs-deref'))(
    '%s',
    (provider, classification) => {
      it(`dereferences before translation (${classification.reason})`, () => {
        expect(packageText(provider)).toContain(DEREF_MARK);
      });
    }
  );

  describe.each(Object.entries(PROVIDER_PACKAGES).filter(([, c]) => c.treatment === 'passthrough'))(
    '%s',
    (provider, classification) => {
      it(`forwards the schema whole (${classification.reason})`, () => {
        expect(packageText(provider)).not.toContain(DEREF_MARK);
      });
    }
  );

  describe.each(Object.entries(EXTRA_PASSTHROUGH_SOURCES))('%s', (relPath, reason) => {
    it(`forwards the schema whole (${reason})`, () => {
      const full = path.join(repoRoot, relPath);
      expect(existsSync(full), `${relPath} not found — update this test`).toBe(true);
      expect(readFileSync(full, 'utf8')).not.toContain(DEREF_MARK);
    });
  });

  // Ratchet, currently empty: when a needs-deref provider is added without its
  // fix, give it `status: 'pending-plan-NNN'` and it is asserted NOT to
  // dereference here — so the fix cannot land and leave the taxonomy stale
  // (the assertion flips the moment the dereference call appears).
  describe.each(
    Object.entries(PROVIDER_PACKAGES).filter(([, c]) => c.status?.startsWith('pending-plan'))
  )('%s', (provider, classification) => {
    it(`is still pending (${classification.status})`, () => {
      expect(packageText(provider)).not.toContain(DEREF_MARK);
    });
  });
});
