"use client"

import {
  TERMINAL_THEMES,
  type TerminalTheme,
} from "@/lib/terminal-themes"
import * as React from "react"

const STORAGE_KEY = "terminal-kit:theme"

const listeners = new Set<() => void>()

function readStoredTheme(): TerminalTheme {
  if (typeof window === "undefined") return "default"

  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored && TERMINAL_THEMES.includes(stored as TerminalTheme)) {
    return stored as TerminalTheme
  }

  return "default"
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return readStoredTheme()
}

function getServerSnapshot(): TerminalTheme {
  return "default"
}

function setStoredTheme(next: TerminalTheme) {
  window.localStorage.setItem(STORAGE_KEY, next)
  listeners.forEach((listener) => listener())
}

type TerminalThemeContextValue = {
  theme: TerminalTheme
  setTheme: (theme: TerminalTheme) => void
}

const TerminalThemeContext = React.createContext<TerminalThemeContextValue | null>(
  null
)

export function TerminalThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )

  const setTheme = React.useCallback((next: TerminalTheme) => {
    setStoredTheme(next)
  }, [])

  return (
    <TerminalThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </TerminalThemeContext.Provider>
  )
}

export function useTerminalTheme() {
  const context = React.useContext(TerminalThemeContext)
  if (!context) {
    throw new Error("useTerminalTheme must be used within TerminalThemeProvider")
  }

  return context
}

export function useTerminalThemeOptional() {
  return React.useContext(TerminalThemeContext)
}
