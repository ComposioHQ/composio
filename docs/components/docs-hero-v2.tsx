import { DocsHeroV2Chat } from './docs-hero-v2-chat';

/**
 * Welcome-page hero. The intent selector immediately below owns navigation,
 * while this section explains the shared outcome for both audiences.
 */
export function DocsHeroV2() {
  return (
    <section className="relative grid grid-cols-1 items-start gap-8 py-4 md:py-6 lg:min-h-[340px] lg:grid-cols-2 lg:gap-12">
      <div className="flex flex-col gap-5">
        <h1 className="text-3xl font-medium leading-[1.05] tracking-[-0.025em] text-fd-foreground md:text-4xl lg:text-[40px]">
          Give any agent the tools to take action.
        </h1>

        <p className="max-w-[480px] text-[15px] leading-[1.55] text-fd-foreground/70 md:text-base">
          Build Composio into your product, or connect it to the agents and
          workflows you already use.
        </p>
      </div>

      {/* Right side: mock chat with a floating active-tool card.
          Hidden below lg: the layered animation is fiddly on small
          screens and the left column carries the welcome on its own. */}
      <div className="relative hidden lg:block lg:h-full">
        <DocsHeroV2Chat />
      </div>
    </section>
  );
}
