export const TERMINAL_THEMES = ["default", "grok", "claude"] as const

export type TerminalTheme = (typeof TERMINAL_THEMES)[number]

export const TERMINAL_THEME_LABELS: Record<TerminalTheme, string> = {
  default: "Default",
  grok: "Grok",
  claude: "Claude",
}

export function terminalThemeClass(theme: TerminalTheme = "default") {
  return theme === "default" ? "terminal-theme-default" : `terminal-theme-${theme}`
}

export function terminalThemeLightClass(theme: TerminalTheme = "default") {
  return theme === "default" ? "terminal-theme-light" : `terminal-theme-${theme}-light`
}

export function terminalThemeClasses(
  theme: TerminalTheme = "default",
  variant: "dark" | "light" = "dark"
) {
  return [
    "terminal-theme",
    terminalThemeClass(theme),
    variant === "light" ? terminalThemeLightClass(theme) : null,
  ].filter(Boolean) as string[]
}
