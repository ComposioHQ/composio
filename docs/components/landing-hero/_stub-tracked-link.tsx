"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, MouseEventHandler, ReactNode } from "react";

/**
 * Stand-in for the landing-page `TrackedLink` (which fires PostHog
 * analytics events). In docs we just render a plain link and ignore
 * the analytics props so the call sites in `hero-section.tsx` keep
 * working without further changes.
 */
interface TrackedLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  baseUrl: string;
  /** Ignored — analytics layer not present in docs. */
  event?: unknown;
  /** Ignored — analytics layer not present in docs. */
  placement?: string;
  children?: ReactNode;
  onMouseEnter?: MouseEventHandler<HTMLAnchorElement>;
  onMouseLeave?: MouseEventHandler<HTMLAnchorElement>;
}

export function TrackedLink({
  baseUrl,
  event: _event,
  placement: _placement,
  children,
  ...rest
}: TrackedLinkProps) {
  return (
    <Link href={baseUrl} {...rest}>
      {children}
    </Link>
  );
}
