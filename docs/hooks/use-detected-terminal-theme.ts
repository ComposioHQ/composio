"use client"

import {
  TERMINAL_THEMES,
  type TerminalTheme,
} from "@/lib/terminal-themes"
import * as React from "react"

function readThemeFromElement(element: Element | null): TerminalTheme {
  if (!element) return "default"

  for (const theme of TERMINAL_THEMES) {
    if (theme === "default") continue
    if (element.classList.contains(`terminal-theme-${theme}`)) return theme
  }

  return "default"
}

/** Reads the active palette from the nearest `.terminal-theme` ancestor. */
export function useDetectedTerminalTheme() {
  const ref = React.useRef<HTMLDivElement>(null)
  const [theme, setTheme] = React.useState<TerminalTheme>("default")

  React.useLayoutEffect(() => {
    const root = ref.current?.closest(".terminal-theme")
    if (!root) {
      setTheme("default")
      return
    }

    const sync = () => setTheme(readThemeFromElement(root))
    sync()

    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return { ref, theme }
}
