import { createPatch } from 'diff';
import { getSingularPatch } from '@pierre/diffs';
import { preloadFileDiff } from '@pierre/diffs/ssr';
import { DiffView } from './diff-view';
import { FILE_BUILDS } from '@/lib/imessage-build';

async function diffFor(file: string, prev: string, code: string) {
  const fileDiff = getSingularPatch(createPatch(file, prev, code, '', ''));
  const { prerenderedHTML } = await preloadFileDiff({ fileDiff, options: { diffStyle: 'unified' } });
  return { fileDiff, prerenderedHTML };
}

function StepCard({
  n,
  title,
  file,
  description,
  fileDiff,
  prerenderedHTML,
  code,
}: {
  n: number;
  title: string;
  file: string;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fileDiff: any;
  prerenderedHTML: string;
  code: string;
}) {
  return (
    <div className="overflow-hidden rounded-sm border border-fd-border bg-fd-background">
      <div className="flex items-center gap-2.5 border-b border-fd-border px-3 py-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-[var(--composio-brand)]/10 font-mono text-[11px] font-medium text-[var(--composio-brand)]">
          {n}
        </span>
        <span className="text-[13px] font-medium text-fd-foreground">{title}</span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/40">{file}</span>
      </div>
      {description ? <p className="px-3 pt-2.5 text-[13px] leading-snug text-fd-foreground/65">{description}</p> : null}
      <div className="p-3">
        <DiffView fileDiff={fileDiff} prerenderedHTML={prerenderedHTML} code={code} />
      </div>
    </div>
  );
}

/**
 * ImessageFileBuildup — renders the iMessage SEND tool growing a piece at a
 * time. Each step is a green diff against the previous stage (via @pierre/diffs),
 * mirroring the Pi example's FileBuildup.
 */
export async function ImessageFileBuildup({ name }: { name: keyof typeof FILE_BUILDS }) {
  const build = FILE_BUILDS[name];

  const steps = [];
  let prev = '';
  for (const stage of build.stages) {
    steps.push({ ...stage, ...(await diffFor(build.file, prev, stage.code)) });
    prev = stage.code;
  }

  return (
    <div className="not-prose my-6 flex flex-col gap-5">
      {steps.map((s, i) => (
        <StepCard
          key={s.title}
          n={i + 1}
          title={s.title}
          file={build.file}
          description={s.description}
          fileDiff={s.fileDiff}
          prerenderedHTML={s.prerenderedHTML}
          code={s.code}
        />
      ))}
    </div>
  );
}
