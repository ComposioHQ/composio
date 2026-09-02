import Image from 'next/image';
import { DOCS_PRODUCTS, type DocsProduct } from '@/lib/home-navigation';

const PLATFORM_BADGE_GRADIENT =
  'linear-gradient(135deg, #00e68a, #00b4d8, #0077ff)';

export function ProductBadge({ product }: { product: DocsProduct }) {
  const isPlatform = product === 'platform';

  return (
    <span
      className={
        'relative flex items-center rounded-[5px] px-[9px] py-[7px] font-mono text-[14px] font-semibold uppercase leading-none tracking-wide ' +
        (isPlatform
          ? 'product-badge-platform'
          : 'text-[#0007cd] dark:text-[#4d6fff]')
      }
      style={
        isPlatform
          ? {
              background: PLATFORM_BADGE_GRADIENT,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }
          : undefined
      }
    >
      <span
        aria-hidden="true"
        className={
          'pointer-events-none absolute inset-0 rounded-[5px] ' +
          (isPlatform
            ? 'product-badge-platform-border'
            : 'border border-[#0007cd] dark:border-[#4d6fff]')
        }
        style={
          isPlatform
            ? {
                padding: '1px',
                background: PLATFORM_BADGE_GRADIENT,
                WebkitMask:
                  'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                maskComposite: 'exclude',
              }
            : undefined
        }
      />
      {DOCS_PRODUCTS[product].product}
    </span>
  );
}

export function ProductLockup({
  product,
  compactOnMobile = false,
}: {
  product: DocsProduct;
  compactOnMobile?: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className={compactOnMobile ? 'max-[420px]:hidden' : undefined}>
        <Image
          alt="Composio"
          className="h-[22px] w-auto dark:hidden"
          height={20}
          priority
          src="/Composio Logo.svg"
          width={110}
        />
        <Image
          alt="Composio"
          className="hidden h-[22px] w-auto dark:block"
          height={20}
          priority
          src="/Composio Logo Dark.svg"
          width={110}
        />
      </span>
      <ProductBadge product={product} />
    </span>
  );
}
