'use client';

import { FileTree, useFileTree, useFileTreeSelection } from '@pierre/trees/react';
import { File } from '@pierre/diffs/react';
import { CopyButton } from './copy-button';

export interface RepoFile {
  path: string;
  contents: string;
  composio: boolean;
  prerenderedHTML: string;
}

/**
 * RepoBrowserClient — the IDE-style split: file tree on the left (@pierre/trees),
 * the selected file's code on the right (@pierre/diffs). Code is prerendered on
 * the server so the first paint is correct; selection swaps which file shows.
 */
export function RepoBrowserClient({ files }: { files: RepoFile[] }) {
  const paths = files.map((f) => f.path);
  const { model } = useFileTree({ paths, initialSelectedPaths: [paths[0]], initialExpansion: 'open' });
  const selected = useFileTreeSelection(model);

  const path = selected.find((p) => files.some((f) => f.path === p)) ?? paths[0];
  const file = files.find((f) => f.path === path) ?? files[0];

  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-sm border border-fd-border bg-fd-card md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
      <div className="max-h-[640px] overflow-auto border-b border-fd-border p-2 md:border-b-0 md:border-r">
        <FileTree model={model} />
      </div>
      <div className="relative max-h-[640px] overflow-auto">
        <CopyButton text={file.contents} className="absolute right-2 top-2 z-10" />
        <File
          key={file.path}
          file={{ name: file.path, contents: file.contents }}
          prerenderedHTML={file.prerenderedHTML}
          disableWorkerPool
        />
      </div>
    </div>
  );
}
