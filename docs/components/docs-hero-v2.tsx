import { TOOLKIT_COUNT_LABEL } from '@/lib/toolkit-count';
import { AgentSetupActions } from './agent-setup-actions';

export function DocsHeroV2() {
  return (
    <section className="border-b border-fd-border py-9 sm:py-11">
      <div className="flex max-w-[760px] flex-col gap-5">
        <h1 className="text-4xl font-medium leading-[1.05] tracking-[-0.03em] text-fd-foreground sm:text-5xl">
          Build agents with Composio.
        </h1>

        <p className="max-w-[620px] text-base leading-[1.6] text-fd-foreground/70 sm:text-lg">
          Give your agents tools, managed authentication, and secure execution
          across {TOOLKIT_COUNT_LABEL} apps.
        </p>

        <AgentSetupActions />
      </div>
    </section>
  );
}
