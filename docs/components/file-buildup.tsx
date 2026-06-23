import { createPatch } from 'diff';
import { getSingularPatch } from '@pierre/diffs';
import { preloadFileDiff } from '@pierre/diffs/ssr';
import { DiffView } from './diff-view';
import { FILE_BUILDS } from '@/lib/slack-bot-build';

/**
 * FileBuildup — renders one of the example's files growing a piece at a time.
 * Each step is a diff against the previous stage (powered by @pierre/diffs), so
 * the reader watches exactly what each concept adds, ending in the full file.
 *
 * Async server component: diff metadata and prerendered HTML are computed at
 * build/request time; the client only hydrates an already-correct diff.
 */
export async function FileBuildup({ name }: { name: keyof typeof FILE_BUILDS }) {
  const build = FILE_BUILDS[name];

  const steps = [];
  let prev = '';
  for (const stage of build.stages) {
    const patch = createPatch(build.file, prev, stage.code, '', '');
    const fileDiff = getSingularPatch(patch);
    const { prerenderedHTML } = await preloadFileDiff({ fileDiff, options: { diffStyle: 'unified' } });
    steps.push({ ...stage, fileDiff, prerenderedHTML });
    prev = stage.code;
  }

  return (
    <div className="not-prose my-6 flex flex-col gap-5">
      {steps.map((step, i) => (
        <div key={step.title} className="overflow-hidden rounded-sm border border-fd-border bg-fd-background">
          <div className="flex items-center gap-2.5 border-b border-fd-border px-3 py-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-[var(--composio-brand)]/10 font-mono text-[11px] font-medium text-[var(--composio-brand)]">
              {i + 1}
            </span>
            <span className="text-[13px] font-medium text-fd-foreground">{step.title}</span>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/40">
              {build.file}
            </span>
          </div>
          <p className="px-3 pt-2.5 text-[13px] leading-snug text-fd-foreground/65">{step.description}</p>
          <div className="p-3">
            <DiffView fileDiff={step.fileDiff} prerenderedHTML={step.prerenderedHTML} />
          </div>
        </div>
      ))}
    </div>
  );
}
