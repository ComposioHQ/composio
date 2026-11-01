import type { SVGProps } from 'react';

// Exact Nucleo IconBoltOutline18 / IconBoltFill18 paths used by the dashboard.
export function InstantBolt({ filled = false, ...props }: SVGProps<SVGSVGElement> & { filled?: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" {...props}>
      {filled ? (
        <path d="M15.6449 7.0522C15.474 6.7114 15.1317 6.5 14.7504 6.5H10.2948L10.559 2.0312C10.5844 1.6025 10.3305 1.2148 9.9272 1.0668C9.5244 0.920302 9.0791 1.0507 8.8222 1.3949L2.4492 9.9008C2.2207 10.206 2.185 10.6069 2.3554 10.9477C2.5258 11.2885 2.8686 11.4999 3.2494 11.4999H7.705L7.4408 15.9687C7.4154 16.3974 7.6693 16.7851 8.0726 16.9331C8.1825 16.9731 8.2957 16.9927 8.4076 16.9927C8.705 16.9927 8.9906 16.855 9.1776 16.605L15.5511 8.0991C15.7791 7.7944 15.8153 7.393 15.6449 7.0522Z" fill="currentColor" />
      ) : (
        <path d="M14.7505 7.25H9.49905L9.81065 1.9868C9.82325 1.7732 9.55085 1.6734 9.42255 1.8446L3.04965 10.3501C2.92615 10.5149 3.04376 10.75 3.24976 10.75H8.50115L8.18955 16.0132C8.17695 16.2268 8.44935 16.3266 8.57765 16.1554L14.9506 7.6499C15.0741 7.4851 14.9565 7.25 14.7505 7.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      )}
    </svg>
  );
}
