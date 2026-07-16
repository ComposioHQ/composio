import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { interactivePermissionUiDisabledConfig } from 'src/services/native-ui-sidecar';

const loadFlag = (entries: Record<string, string>): boolean =>
  Effect.runSync(
    ConfigProvider.fromMap(new Map(Object.entries(entries))).load(
      interactivePermissionUiDisabledConfig
    )
  );

describe('native UI sidecar', () => {
  it('disables interactive permission UI in CI and Vitest environments', () => {
    expect(loadFlag({})).toBe(false);
    expect(loadFlag({ CI: 'true' })).toBe(true);
    expect(loadFlag({ CI: '1' })).toBe(true);
    expect(loadFlag({ CI: 'woohoo' })).toBe(true);
    expect(loadFlag({ CI: 'false' })).toBe(false);
    expect(loadFlag({ CI: '' })).toBe(false);
    expect(loadFlag({ VITEST: 'true' })).toBe(true);
  });

  it('lets COMPOSIO_DISABLE_PERMISSION_UI override environment detection in both directions', () => {
    expect(loadFlag({ COMPOSIO_DISABLE_PERMISSION_UI: '1' })).toBe(true);
    expect(loadFlag({ COMPOSIO_DISABLE_PERMISSION_UI: 'true' })).toBe(true);
    expect(loadFlag({ COMPOSIO_DISABLE_PERMISSION_UI: '0', CI: 'true', VITEST: 'true' })).toBe(
      false
    );
    expect(loadFlag({ COMPOSIO_DISABLE_PERMISSION_UI: '', CI: 'true' })).toBe(true);
  });
});
