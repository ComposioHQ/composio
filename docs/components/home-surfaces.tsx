import { ArrowUpRight } from 'lucide-react';
import {
  DOCS_PRODUCTS,
  HOME_INTENTS,
  homeIntentAnchor,
  type HomeIntent,
} from '@/lib/home-navigation';
import { ProductLockup } from './product-lockup';
import { ProductSelectionLink } from './product-selection-link';
import { SectionHeading } from './home-features';

export function HomeSurfaces() {
  return (
    <section className="not-prose mb-14 pt-12 sm:pt-14" id="two-ways-to-start">
      <SectionHeading
        eyebrow="Choose your path"
        title="Start with the product that fits your work."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {HOME_INTENTS.map(intent => (
          <IntentCard key={intent.id} intent={intent} />
        ))}
      </div>
    </section>
  );
}

function IntentCard({ intent }: { intent: HomeIntent }) {
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-fd-border bg-fd-card shadow-[0_1px_0_rgba(15,15,15,0.04)]">
      <ProductSelectionLink
        className="group border-b border-fd-border bg-fd-background p-5 no-underline transition-colors hover:bg-fd-accent/25 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fd-ring"
        href={DOCS_PRODUCTS[intent.productId].landingRoute}
        product={intent.productId}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2.5">
            <h3 className="flex items-center gap-2" id={homeIntentAnchor(intent.product)}>
              <ProductLockup product={intent.productId} />
            </h3>
            <p className="max-w-[42ch] text-pretty text-[15px] font-medium leading-[1.45] text-fd-foreground/85">
              {intent.description}
            </p>
          </div>
          <ArrowUpRight
            aria-hidden="true"
            className="mt-1 size-3.5 shrink-0 text-fd-foreground/40 transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
          />
        </div>
      </ProductSelectionLink>
      <ul className="flex flex-col divide-y divide-fd-border">
        {intent.links.map(link => (
          <li className="flex" key={link.href}>
            <ProductSelectionLink
              className="group flex flex-1 items-center justify-between gap-4 px-5 py-3.5 no-underline transition-colors hover:bg-fd-accent/40"
              href={link.href}
              product={intent.productId}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13.5px] font-medium text-fd-foreground">
                  {link.title}
                </span>
                <span className="text-[12px] leading-[1.45] text-fd-foreground/60">
                  {link.description}
                </span>
              </span>
              <ArrowUpRight
                aria-hidden="true"
                className="size-3.5 shrink-0 text-fd-foreground/50 transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
              />
            </ProductSelectionLink>
          </li>
        ))}
      </ul>
    </article>
  );
}
