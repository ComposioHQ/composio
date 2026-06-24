import * as React from "react"

import { cn } from "@/lib/utils"

import { TerminalPrompt } from "../shell/terminal-line"

export type MessageProps = React.HTMLAttributes<HTMLDivElement> & {
  prompt?: string
}

/** Submitted user message row, shown inside SessionContent. */
export function Message({
  prompt = "❯",
  className,
  children,
  ...props
}: MessageProps) {
  return (
    <div
      className={cn(
        "terminal-session-sent flex w-full items-start gap-2 bg-[var(--terminal-panel-strong)] py-1 text-[11px] text-[var(--terminal-fg)]",
        className
      )}
      {...props}
    >
      <TerminalPrompt symbol={prompt} tone="input" />
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{children}</span>
    </div>
  )
}
