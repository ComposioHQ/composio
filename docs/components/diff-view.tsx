'use client';

import { FileDiff, type FileDiffProps } from '@pierre/diffs/react';
import { CopyButton } from './copy-button';

/**
 * The +/- stat counts live inside @pierre/diffs's open shadow root, so the
 * site's global CSS can't reach them. `unsafeCSS` is injected as a <style>
 * element *inside* that shadow root (both for the SSR-prerendered HTML and the
 * hydrated client render), which is the only place a selector for these counts
 * actually matches. Keep this in sync between the SSR preload and FileDiff.
 */
export const HIDE_DIFF_STATS_CSS = '[data-additions-count],[data-deletions-count]{display:none !important;}';

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
      {code ? <CopyButton text={code} className="absolute right-2 top-2 z-10" /> : null}
      <FileDiff {...props} options={{ diffStyle: 'unified', unsafeCSS: HIDE_DIFF_STATS_CSS }} disableWorkerPool />
    </div>
  );
}
