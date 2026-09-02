import { describe, expect, test } from 'bun:test';

import {
  classifyDocsProduct,
  DEFAULT_DOCS_PRODUCT,
  DOCS_PRODUCTS,
  docsProductDestination,
  parseDocsProduct,
  resolveDocsProduct,
  serializeDocsProductCookie,
  shouldAnimateDocsProductSwitch,
} from '../../lib/home-navigation';
import { buildProductPageTree, pageTreeUrls } from '../../lib/product-page-tree';
import { source } from '../../lib/source';

describe('Docs product navigation', () => {
  test('defines the product labels, descriptions, landings, and theme defaults once', () => {
    expect(DEFAULT_DOCS_PRODUCT).toBe('platform');
    expect(DOCS_PRODUCTS['for-you']).toMatchObject({
      product: 'For You',
      switcherDescription: 'Connect your apps to AI clients.',
      landingRoute: '/docs/agent-plugins',
      defaultTheme: 'light',
    });
    expect(DOCS_PRODUCTS.platform).toMatchObject({
      product: 'Platform',
      switcherDescription: 'Build agents with the Composio SDK.',
      landingRoute: '/docs/quickstart',
      defaultTheme: 'dark',
    });
  });

  test('classifies audience routes while leaving shared routes unclassified', () => {
    expect(classifyDocsProduct('/docs/agent-plugins')).toBe('for-you');
    expect(classifyDocsProduct('/docs/composio-connect')).toBe('for-you');
    expect(classifyDocsProduct('/docs/providers/openai')).toBe('platform');
    expect(classifyDocsProduct('/docs/authentication/controlling-scopes')).toBe('platform');
    expect(classifyDocsProduct('/docs')).toBeNull();
    expect(classifyDocsProduct('/docs/security/overview')).toBeNull();
  });

  test('uses route inference before persistence and the documented default last', () => {
    expect(resolveDocsProduct('/docs/quickstart', 'for-you')).toBe('platform');
    expect(resolveDocsProduct('/docs/security/overview', 'for-you')).toBe('for-you');
    expect(resolveDocsProduct('/docs/security/overview', 'platform')).toBe('platform');
    expect(resolveDocsProduct('/docs', 'invalid')).toBe('platform');
    expect(parseDocsProduct('for-you')).toBe('for-you');
    expect(parseDocsProduct('anything-else')).toBeNull();
    expect(serializeDocsProductCookie('for-you')).toContain(
      'composio-docs-product=for-you',
    );
    expect(serializeDocsProductCookie('for-you')).toContain('SameSite=Lax');
  });

  test('uses meaningful counterparts and otherwise falls back to product landings', () => {
    expect(docsProductDestination('/docs/quickstart', 'for-you')).toBe(
      '/docs/agent-plugins',
    );
    expect(docsProductDestination('/docs/agent-plugins', 'platform')).toBe(
      '/docs/quickstart',
    );
    expect(docsProductDestination('/docs/sessions-via-mcp', 'for-you')).toBe(
      '/docs/composio-connect',
    );
    expect(docsProductDestination('/docs/composio-connect', 'platform')).toBe(
      '/docs/sessions-via-mcp',
    );
    expect(docsProductDestination('/docs/authentication', 'for-you')).toBe(
      '/docs/agent-plugins',
    );
    expect(docsProductDestination('/docs/cli', 'platform')).toBe('/docs/quickstart');
  });

  test('animates only when view transitions are available and motion is allowed', () => {
    expect(shouldAnimateDocsProductSwitch(true, false)).toBe(true);
    expect(shouldAnimateDocsProductSwitch(false, false)).toBe(false);
    expect(shouldAnimateDocsProductSwitch(true, true)).toBe(false);
  });

  test('fades the outgoing product snapshot while revealing the incoming product', async () => {
    const globalCss = await Bun.file(
      new URL('../../app/global.css', import.meta.url),
    ).text();
    const outgoingSnapshotRule = globalCss.match(
      /::view-transition-old\(docs-product-shell\)\s*\{(?<rule>[^}]*)\}/,
    );

    expect(outgoingSnapshotRule?.groups?.rule).toContain('docs-product-fade-out');
    expect(outgoingSnapshotRule?.groups?.rule).not.toContain('animation: none');
    expect(globalCss).toContain('@keyframes docs-product-fade-out');
  });

  test('builds audience-specific trees and keeps shared resources in both', () => {
    const forYouTree = buildProductPageTree(source.pageTree, 'for-you');
    const platformTree = buildProductPageTree(source.pageTree, 'platform');
    const forYouUrls = pageTreeUrls(forYouTree);
    const platformUrls = pageTreeUrls(platformTree);

    expect(forYouTree.$id).not.toBe(platformTree.$id);

    expect(forYouUrls).toContain('/docs/agent-plugins');
    expect(forYouUrls).toContain('/docs/cli');
    expect(forYouUrls).toContain('/docs/composio-connect');
    expect(forYouUrls).not.toContain('/docs/quickstart');

    for (const url of [
      '/docs/quickstart',
      '/docs/providers',
      '/docs/how-composio-works',
      '/docs/authentication',
      '/docs/skills',
      '/docs/triggers',
    ]) {
      expect(platformUrls).toContain(url);
    }
    expect(platformUrls).not.toContain('/docs/agent-plugins');

    expect(forYouUrls).not.toContain('/docs');
    expect(platformUrls).not.toContain('/docs');

    for (const sharedUrl of ['/docs/security/overview', '/docs/security/data-retention']) {
      expect(forYouUrls).toContain(sharedUrl);
      expect(platformUrls).toContain(sharedUrl);
    }
  });

  test('keeps accessibility-critical switcher semantics and visible focus styles', async () => {
    const switcherSource = await Bun.file(
      new URL('../../components/product-switcher.tsx', import.meta.url),
    ).text();
    const sharedLayoutSource = await Bun.file(
      new URL('../../lib/layout.shared.tsx', import.meta.url),
    ).text();

    expect(switcherSource).toContain('aria-label={`Switch Composio product. Current product:');
    expect(switcherSource).toContain('role="radiogroup"');
    expect(switcherSource).toContain('role="radio"');
    expect(switcherSource).toContain('aria-checked={isCurrent}');
    expect(switcherSource).toContain("aria-current={isCurrent ? 'page' : undefined}");
    expect(switcherSource).toContain('focus-visible:outline-2');
    expect(sharedLayoutSource).toContain('slots: { navTitle: ProductNavTitle }');
  });
});
