'use client';

import { FileDiff, type FileDiffProps } from '@pierre/diffs/react';
import { CopyButton } from './copy-button';

/**
 * Thin client wrapper around @pierre/diffs FileDiff. The diff metadata and
 * prerendered HTML are computed on the server so the first paint is correct
 * without a worker round-trip. Pass `code` (the full file at this stage) to show
 * a copy-to-clipboard button.
 */
export function DiffView({
  code,
  ...props
}: Pick<FileDiffProps<undefined>, 'fileDiff' | 'prerenderedHTML'> & { code?: string }) {
  return (
    <div className="relative w-full">
      {code ? <CopyButton text={code} className="absolute right-1.5 top-1.5 z-10" /> : null}
      <FileDiff {...props} options={{ diffStyle: 'unified' }} disableWorkerPool />
    </div>
  );
}
