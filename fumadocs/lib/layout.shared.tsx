import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';

// Composio Logo Component with light/dark mode switching
function ComposioLogo() {
  return (
    <>
      {/* Light mode logo (black) */}
      <Image
        src="/Composio Logo.svg"
        alt="Composio"
        width={110}
        height={20}
        className="dark:hidden"
        priority
      />
      {/* Dark mode logo (white) */}
      <Image
        src="/Composio Logo Dark.svg"
        alt="Composio"
        width={110}
        height={20}
        className="hidden dark:block"
        priority
      />
    </>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <ComposioLogo />,
      transparentMode: 'top',
    },
  };
}
