import { describe, expect, test } from 'bun:test';
import { toCleanMarkdown } from '../../agent/lib/docs';

describe('agent Markdown HTML safety', () => {
  test('removes MDX tags and neutralizes malformed or nested HTML', () => {
    const markdown = toCleanMarkdown(`---
title: Unsafe input
---

<Callout>Keep 5 < 7 and <scr<script>alert(1)</script>ipt>.</Callout>
`);

    expect(markdown).not.toContain('<');
    expect(markdown).not.toContain('>');
    expect(markdown).not.toContain('<script');
    expect(markdown).toContain('5 &lt; 7');
    expect(markdown).toContain('&lt;scralert(1)ipt&gt;');
  });
});
