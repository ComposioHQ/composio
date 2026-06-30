import type { TerminalTheme } from "@/lib/terminal-themes"

/** Per-theme structural layout — distinct from palette tokens alone. */
export type TerminalLayoutMode = "bubble" | "compact" | "claude"

export function terminalLayoutMode(theme: TerminalTheme): TerminalLayoutMode {
  if (theme === "claude") return "claude"
  if (theme === "default") return "bubble"
  return "compact"
}
