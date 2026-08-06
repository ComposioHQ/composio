/**
 * Heading levels in the agent-facing markdown channel.
 *
 * `mdxToCleanMarkdown` carries a cleanup rule for a doubled-hash artifact the
 * `<Step>` / `<StepTitle>` unwrapping produces: `<StepTitle>` first rewrites
 * its body to `#### Title`, and the `<Step>` rule then matches the leading
 * `###` of that very output and re-prefixes it, yielding `#### # Title`.
 *
 * That rule used to be written with an optional separator, so it also matched
 * an ordinary `## Heading` — reading the first `#` as the prefix and the
 * second as the stray one — and demoted every heading below h1 by one level on
 * every page in every `.md` response.
 *
 * These tests lock both halves at once: authored heading levels survive
 * verbatim, and the artifact the rule exists for still collapses.
 */
import { describe, expect, test } from 'bun:test';

import { mdxToCleanMarkdown } from '../../lib/source';

describe('mdxToCleanMarkdown — authored heading levels', () => {
  test('preserves an h2', () => {
    expect(mdxToCleanMarkdown('## Endpoints\n')).toBe('## Endpoints');
  });

  test('preserves an h3', () => {
    expect(mdxToCleanMarkdown('### Sub\n')).toBe('### Sub');
  });

  test('preserves a whole heading ladder and the prose between it', () => {
    const markdown = mdxToCleanMarkdown(
      '# Title\n\nintro\n\n## Endpoints\n\ntext\n\n### Sub\n\nmore\n\n#### Deep\n\n##### Deeper\n\n###### Deepest\n'
    );

    expect(markdown).toContain('# Title');
    expect(markdown).toContain('## Endpoints');
    expect(markdown).toContain('### Sub');
    expect(markdown).toContain('#### Deep');
    expect(markdown).toContain('##### Deeper');
    expect(markdown).toContain('###### Deepest');
  });

  test('preserves an indented heading', () => {
    expect(mdxToCleanMarkdown('  ## Indented\n')).toContain('## Indented');
  });
});

describe('mdxToCleanMarkdown — doubled-hash cleanup', () => {
  test('collapses the `#### # Title` artifact to `#### Title`', () => {
    const markdown = mdxToCleanMarkdown('#### # Title\n');
    expect(markdown).toContain('#### Title');
    expect(markdown).not.toContain('# # Title');
  });

  test('collapses the artifact at other prefix depths', () => {
    expect(mdxToCleanMarkdown('## # Title\n')).toContain('## Title');
    expect(mdxToCleanMarkdown('###### # Title\n')).toContain('###### Title');
  });

  test('drops a bare `#` line', () => {
    expect(mdxToCleanMarkdown('before\n\n#\n\nafter\n')).not.toContain('#');
  });
});

describe('mdxToCleanMarkdown — Steps end to end', () => {
  test('`<Step>` wrapping a `<StepTitle>` emits a single h4', () => {
    const markdown = mdxToCleanMarkdown(
      '<Steps>\n<Step>\n<StepTitle>## Install the SDK</StepTitle>\nbody\n</Step>\n</Steps>\n'
    );

    expect(markdown).toContain('#### Install the SDK');
    expect(markdown).not.toContain('# # Install');
    expect(markdown).not.toContain('<Step');
    expect(markdown).toContain('body');
  });

  test('`<Step>### Title` becomes an h4', () => {
    const markdown = mdxToCleanMarkdown(
      '<Steps>\n<Step>### Install the SDK\nbody\n</Step>\n</Steps>\n'
    );

    // Matched as a whole line: `#### X` trivially contains `### X`.
    expect(markdown.split('\n')).toContain('#### Install the SDK');
    expect(markdown).not.toContain('<Step');
  });

  test('a bare `<StepTitle>` with no hashes becomes an h4', () => {
    const markdown = mdxToCleanMarkdown('<Step>\n<StepTitle>Install</StepTitle>\n</Step>\n');
    expect(markdown).toContain('#### Install');
    expect(markdown).not.toContain('# # Install');
  });

  test('authored h2 siblings around a Steps block keep their level', () => {
    const markdown = mdxToCleanMarkdown(
      '## Setup\n\n<Steps>\n<Step>\n<StepTitle>## Install</StepTitle>\nbody\n</Step>\n</Steps>\n\n## Next steps\n\ntext\n'
    );

    expect(markdown).toContain('## Setup');
    expect(markdown).toContain('#### Install');
    expect(markdown).toContain('## Next steps');
  });
});
