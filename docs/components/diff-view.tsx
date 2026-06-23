'use client';

import { FileDiff, type FileDiffProps } from '@pierre/diffs/react';

/**
 * Thin client wrapper around @pierre/diffs FileDiff. The diff metadata and
 * prerendered HTML are computed on the server (see the page) so the first paint
 * is correct without a worker round-trip. Unified layout fits prose width.
 */
export function DiffView(props: Pick<FileDiffProps<undefined>, 'fileDiff' | 'prerenderedHTML'>) {
  return (
    <div style={{ width: '100%' }}>
      <FileDiff {...props} options={{ diffStyle: 'unified' }} disableWorkerPool />
    </div>
  );
}
