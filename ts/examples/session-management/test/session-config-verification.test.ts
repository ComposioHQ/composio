import { describe, expect, test } from 'bun:test';
import {
  cleanupVerificationSessions,
  listAllSessionConfigs,
} from '../src/session-config-verification';

describe('Session config verification', () => {
  test.each([false, true])('reads every page with archived=%s', async archived => {
    const cursors: (string | undefined)[] = [];
    const items = await listAllSessionConfigs(
      {
        async list(params) {
          expect(params?.archived).toBe(archived);
          cursors.push(params?.cursor);
          return {
            items: [
              {
                id: params?.cursor === undefined ? 'sc_first' : 'sc_target',
                name: 'Verification config',
                archived,
                createdAt: '2026-09-01T00:00:00Z',
                updatedAt: '2026-09-01T00:00:00Z',
              },
            ],
            nextCursor: params?.cursor === undefined ? 'page_2' : null,
          };
        },
      },
      { archived }
    );

    expect(items.map(item => item.id)).toEqual(['sc_first', 'sc_target']);
    expect(cursors).toEqual([undefined, 'page_2']);
  });

  test('stops a repeated cursor instead of hanging', async () => {
    await expect(
      listAllSessionConfigs({
        list: async () => ({ items: [], nextCursor: 'same_page' }),
      })
    ).rejects.toThrow('pagination repeated cursor');
  });

  test('surfaces cleanup errors and still tries the remaining Sessions', async () => {
    const attempted: string[] = [];
    await expect(
      cleanupVerificationSessions(['trs_failed', 'trs_ok'], async id => {
        attempted.push(id);
        if (id === 'trs_failed') throw new Error('Deletion failed');
        return { deleted: true };
      })
    ).rejects.toThrow('Could not delete session trs_failed');
    expect(attempted).toEqual(['trs_failed', 'trs_ok']);
  });

  test('treats an unconfirmed deletion as a cleanup failure', async () => {
    await expect(
      cleanupVerificationSessions(['trs_failed'], async () => ({ deleted: false }))
    ).rejects.toThrow('Could not delete session trs_failed');
  });

  test('succeeds when every Session is deleted', async () => {
    await expect(
      cleanupVerificationSessions(['trs_ok'], async () => ({ deleted: true }))
    ).resolves.toBeUndefined();
  });
});
