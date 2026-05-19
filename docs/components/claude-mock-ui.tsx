import type { ReactNode } from 'react';

type ClaudeMockUIProps = {
  children: ReactNode;
  title?: string;
};

export function ClaudeMockUI({ children, title = 'user — ✻ Claude Code — claude' }: ClaudeMockUIProps) {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl border border-[#dedede] bg-[#f6f6f6] shadow-sm">
      <div className="flex items-center gap-2 border-[#d8d8d8] border-b bg-[#e8e8e8] px-3 py-2">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-[11px] w-[11px] rounded-full bg-[#ff5f57]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#febc2e]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#28c840]" />
        </div>
        <span className="flex-1 truncate text-left font-mono text-[#888] text-[11px]">
          {title}
        </span>
      </div>
      <div className="space-y-4 bg-[#f6f6f6] p-5 font-mono text-[13px] text-[#2d2d2d] leading-7 md:text-sm [&_a]:text-[#0000ee] [&_a]:underline [&_a]:underline-offset-2 [&_p]:m-0 [&_strong]:font-semibold [&_strong]:text-[#111]">
        {children}
      </div>
    </div>
  );
}
