import * as React from "react"

import { cn } from "@/lib/utils"

const lineVariantClasses = {
  default: "text-[var(--terminal-fg)]",
  dim: "text-[var(--terminal-dim)]",
  success: "text-[var(--terminal-green)]",
  error: "text-[var(--terminal-red)]",
  warning: "text-[var(--terminal-orange)]",
  thought: "text-[var(--terminal-purple)]",
  command: "text-[var(--terminal-blue)]",
} as const

export type TerminalLineVariant = keyof typeof lineVariantClasses

export type TerminalLineProps = Omit<React.HTMLAttributes<HTMLDivElement>, "prefix"> & {
  variant?: TerminalLineVariant
  prefix?: React.ReactNode
  /** Preserve `\n` in content. Off by default so JSX formatting does not affect layout. */
  preserveWhitespace?: boolean
}

export function TerminalLine({
  variant = "default",
  prefix,
  preserveWhitespace = false,
  className,
  children,
  style,
  ...props
}: TerminalLineProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-2 py-0.5",
        lineVariantClasses[variant],
        className
      )}
      style={style}
      {...props}
    >
      {prefix ? <span className="shrink-0 select-none">{prefix}</span> : null}
      <div
        className={cn(
          "min-w-0 flex-1 break-words",
          preserveWhitespace ? "whitespace-pre-wrap" : "whitespace-normal"
        )}
      >
        {children}
      </div>
    </div>
  )
}

export type TerminalPromptProps = React.HTMLAttributes<HTMLSpanElement> & {
  symbol?: string
  tone?: "input" | "command"
}

export function TerminalPrompt({
  symbol = "❯",
  tone = "command",
  className,
  ...props
}: TerminalPromptProps) {
  return (
    <span
      className={cn("terminal-prompt shrink-0 select-none", className)}
      style={{
        color:
          tone === "input" ? "var(--terminal-teal)" : "var(--terminal-green)",
        fontSize: tone === "input" ? 9 : undefined,
        lineHeight: tone === "input" ? "16px" : undefined,
        display: tone === "input" ? "inline-flex" : undefined,
        alignItems: tone === "input" ? "center" : undefined,
        height: tone === "input" ? 16 : undefined,
      }}
      {...props}
    >
      {symbol}
    </span>
  )
}

