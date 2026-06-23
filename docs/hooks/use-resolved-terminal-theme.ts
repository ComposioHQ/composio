"use client"

import { useTerminalThemeOptional } from "@/components/terminal-theme-provider"
import { useDetectedTerminalTheme } from "@/hooks/use-detected-terminal-theme"
import {
  terminalLayoutMode,
  type TerminalLayoutMode,
} from "@/lib/terminal-layout"
import type { TerminalTheme } from "@/lib/terminal-themes"

export function useResolvedTerminalTheme() {
  const providerTheme = useTerminalThemeOptional()
  const { ref, theme: detectedTheme } = useDetectedTerminalTheme()
  const theme: TerminalTheme = providerTheme?.theme ?? detectedTheme
  const layoutMode: TerminalLayoutMode = terminalLayoutMode(theme)

  return {
    ref,
    theme,
    layoutMode,
    isBubble: layoutMode === "bubble",
    isCompact: layoutMode === "compact",
    isClaude: layoutMode === "claude",
  }
}
