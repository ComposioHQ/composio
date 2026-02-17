import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllPages } from '../../src/utils/pagination';

describe('pagination', () => {
  describe('getAllPages', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return all items from a single page response', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        items: [{ id: 1, name: 'Item 1' }],
        next_cursor: null,
      });

      const result = await getAllPages(mockFetch);

      expect(result).toEqual([{ id: 1, name: 'Item 1' }]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith({
        limit: 100,
      });
    });

    it('should handle multiple pages with cursor', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          items: [{ id: 1, name: 'Item 1' }],
          next_cursor: 'cursor-1',
        })
        .mockResolvedValueOnce({
          items: [{ id: 2, name: 'Item 2' }],
          next_cursor: 'cursor-2',
        })
        .mockResolvedValueOnce({
          items: [{ id: 3, name: 'Item 3' }],
          next_cursor: null,
        });

      const result = await getAllPages(mockFetch);

      expect(result).toEqual([
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' },
      ]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch).toHaveBeenNthCalledWith(1, {
        limit: 100,
      });
      expect(mockFetch).toHaveBeenNthCalledWith(2, {
        cursor: 'cursor-1',
        limit: 100,
      });
      expect(mockFetch).toHaveBeenNthCalledWith(3, {
        cursor: 'cursor-2',
        limit: 100,
      });
    });

    it('should handle empty response', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        items: [],
        next_cursor: null,
      });

      const result = await getAllPages(mockFetch);

      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle response with undefined next_cursor', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        items: [{ id: 1, name: 'Item 1' }],
        next_cursor: undefined,
      });

      const result = await getAllPages(mockFetch);

      expect(result).toEqual([{ id: 1, name: 'Item 1' }]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should stop pagination when next_cursor is null', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          items: [{ id: 1 }],
          next_cursor: 'cursor-1',
        })
        .mockResolvedValueOnce({
          items: [{ id: 2 }],
          next_cursor: null,
        });

      const result = await getAllPages(mockFetch);

      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should stop pagination when next_cursor is undefined', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          items: [{ id: 1 }],
          next_cursor: 'cursor-1',
        })
        .mockResolvedValueOnce({
          items: [{ id: 2 }],
          next_cursor: undefined,
        });

      const result = await getAllPages(mockFetch);

      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should always use limit of 100', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          items: Array.from({ length: 50 }, (_, i) => ({ id: i + 1 })),
          next_cursor: 'cursor-1',
        })
        .mockResolvedValueOnce({
          items: Array.from({ length: 30 }, (_, i) => ({ id: i + 51 })),
          next_cursor: null,
        });

      await getAllPages(mockFetch);

      expect(mockFetch).toHaveBeenNthCalledWith(1, {
        limit: 100,
      });
      expect(mockFetch).toHaveBeenNthCalledWith(2, {
        cursor: 'cursor-1',
        limit: 100,
      });
    });

    it('should handle large datasets across many pages', async () => {
      const pageSize = 100;
      const totalPages = 5;
      const mockFetch = vi.fn();

      // Create 5 pages, each with 100 items
      for (let page = 0; page < totalPages; page++) {
        const items = Array.from({ length: pageSize }, (_, i) => ({
          id: page * pageSize + i + 1,
          name: `Item ${page * pageSize + i + 1}`,
        }));

        mockFetch.mockResolvedValueOnce({
          items,
          next_cursor: page < totalPages - 1 ? `cursor-${page + 1}` : null,
        });
      }

      const result = await getAllPages(mockFetch);

      expect(result).toHaveLength(pageSize * totalPages);
      expect(result[0]).toEqual({ id: 1, name: 'Item 1' });
      expect(result[result.length - 1]).toEqual({
        id: pageSize * totalPages,
        name: `Item ${pageSize * totalPages}`,
      });
      expect(mockFetch).toHaveBeenCalledTimes(totalPages);
    });

    it('should handle pages with varying item counts', async () => {
      type Item = { id: number };
      type PaginationParams = {
        cursor?: string;
        limit: number;
      };

      const mockFetch = vi
        .fn<
          (params: PaginationParams) => Promise<{
            items: Array<Item>;
            next_cursor?: string | null;
          }>
        >()
        .mockResolvedValueOnce({
          items: [{ id: 1 }, { id: 2 }, { id: 3 }],
          next_cursor: 'cursor-1',
        })
        .mockResolvedValueOnce({
          items: [{ id: 4 }],
          next_cursor: 'cursor-2',
        })
        .mockResolvedValueOnce({
          items: [{ id: 5 }, { id: 6 }, { id: 7 }, { id: 8 }, { id: 9 }],
          next_cursor: null,
        });

      const result = await getAllPages(mockFetch);

      expect(result).toHaveLength(9);
      expect(result.map(item => item.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should not include cursor in first request', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        items: [{ id: 1 }],
        next_cursor: null,
      });

      await getAllPages(mockFetch);

      const firstCall = mockFetch.mock.calls[0][0];
      expect(firstCall).not.toHaveProperty('cursor');
      expect(firstCall).toEqual({ limit: 100 });
    });

    it('should include cursor in subsequent requests', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          items: [{ id: 1 }],
          next_cursor: 'cursor-1',
        })
        .mockResolvedValueOnce({
          items: [{ id: 2 }],
          next_cursor: null,
        });

      await getAllPages(mockFetch);

      const secondCall = mockFetch.mock.calls[1][0];
      expect(secondCall).toHaveProperty('cursor', 'cursor-1');
      expect(secondCall).toHaveProperty('limit', 100);
    });

    it('should handle complex item types', async () => {
      interface ComplexItem {
        id: string;
        metadata: {
          tags: string[];
          score: number;
        };
        createdAt: Date;
      }
      type PaginationParams = {
        cursor?: string;
        limit: number;
      };

      const mockFetch = vi
        .fn<
          (params: PaginationParams) => Promise<{
            items: Array<ComplexItem>;
            next_cursor?: string | null;
          }>
        >()
        .mockResolvedValueOnce({
          items: [
            {
              id: 'item-1',
              metadata: { tags: ['tag1', 'tag2'], score: 95 },
              createdAt: new Date('2024-01-01'),
            },
            {
              id: 'item-2',
              metadata: { tags: ['tag3'], score: 87 },
              createdAt: new Date('2024-01-02'),
            },
          ],
          next_cursor: null,
        });

      const result = await getAllPages(mockFetch);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('item-1');
      expect(result[0].metadata.tags).toEqual(['tag1', 'tag2']);
      expect(result[1].id).toBe('item-2');
    });

    it('should handle fetch function that captures closure variables', async () => {
      const baseParam = { filter: 'active' };
      const mockFetch = vi.fn().mockResolvedValueOnce({
        items: [{ id: 1, status: 'active' }],
        next_cursor: null,
      });

      await getAllPages(params => {
        // Simulate a function that uses closure variables
        expect(params.limit).toBe(100);
        return mockFetch({ ...baseParam, ...params });
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle empty items array with cursor', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          items: [],
          next_cursor: 'cursor-1',
        })
        .mockResolvedValueOnce({
          items: [{ id: 1 }],
          next_cursor: null,
        });

      const result = await getAllPages(mockFetch);

      expect(result).toEqual([{ id: 1 }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle all pages having empty items', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          items: [],
          next_cursor: 'cursor-1',
        })
        .mockResolvedValueOnce({
          items: [],
          next_cursor: 'cursor-2',
        })
        .mockResolvedValueOnce({
          items: [],
          next_cursor: null,
        });

      const result = await getAllPages(mockFetch);

      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle cursor with special characters', async () => {
      const specialCursor = 'cursor-with-special-chars-!@#$%^&*()';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          items: [{ id: 1 }],
          next_cursor: specialCursor,
        })
        .mockResolvedValueOnce({
          items: [{ id: 2 }],
          next_cursor: null,
        });

      const result = await getAllPages(mockFetch);

      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
      expect(mockFetch).toHaveBeenNthCalledWith(2, {
        cursor: specialCursor,
        limit: 100,
      });
    });

    it('should handle very long cursor strings', async () => {
      const longCursor = 'a'.repeat(1000);
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          items: [{ id: 1 }],
          next_cursor: longCursor,
        })
        .mockResolvedValueOnce({
          items: [{ id: 2 }],
          next_cursor: null,
        });

      const result = await getAllPages(mockFetch);

      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
      expect(mockFetch).toHaveBeenNthCalledWith(2, {
        cursor: longCursor,
        limit: 100,
      });
    });

    it('should preserve item order across pages', async () => {
      type Item = { id: number };
      type PaginationParams = {
        cursor?: string;
        limit: number;
      };

      const mockFetch = vi
        .fn<
          (params: PaginationParams) => Promise<{
            items: Array<Item>;
            next_cursor?: string | null;
          }>
        >()
        .mockResolvedValueOnce({
          items: [{ id: 1 }, { id: 2 }, { id: 3 }],
          next_cursor: 'cursor-1',
        })
        .mockResolvedValueOnce({
          items: [{ id: 4 }, { id: 5 }],
          next_cursor: 'cursor-2',
        })
        .mockResolvedValueOnce({
          items: [{ id: 6 }, { id: 7 }, { id: 8 }],
          next_cursor: null,
        });

      const result = await getAllPages(mockFetch);

      expect(result.map(item => item.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('should handle async fetch function errors', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          items: [{ id: 1 }],
          next_cursor: 'cursor-1',
        })
        .mockRejectedValueOnce(new Error('Network error'));

      await expect(getAllPages(mockFetch)).rejects.toThrow('Network error');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle fetch function that throws synchronously', async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        throw new Error('Synchronous error');
      });

      await expect(getAllPages(mockFetch)).rejects.toThrow('Synchronous error');
    });
  });
});
