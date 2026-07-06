'use client';

import NextLink from 'next/link';
import {
  type AnchorHTMLAttributes,
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  type ReactNode,
} from 'react';

type SafeNextLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  prefetch?: boolean;
  scroll?: boolean;
};

function flattenChildren(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) => {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      return flattenChildren(child.props.children);
    }

    return child;
  });
}

export const SafeNextLink = forwardRef<HTMLAnchorElement, SafeNextLinkProps>(
  function SafeNextLink({ children, href = '#', prefetch, scroll, ...props }, ref) {
    const external = /^\w+:/.test(href) || href.startsWith('//');
    const hashOnly = href.startsWith('#');
    const shouldScroll = scroll ?? (hashOnly || href.includes('#'));
    const keyedChildren = flattenChildren(children).map((child, index) => (
      <Fragment key={index}>{child}</Fragment>
    ));

    if (external) {
      return (
        <a ref={ref} href={href} rel="noreferrer noopener" target="_blank" {...props}>
          <span className="contents">{keyedChildren}</span>
        </a>
      );
    }

    return (
      <NextLink ref={ref} href={href} prefetch={prefetch} scroll={shouldScroll} {...props}>
        <span className="contents">{keyedChildren}</span>
      </NextLink>
    );
  },
);
