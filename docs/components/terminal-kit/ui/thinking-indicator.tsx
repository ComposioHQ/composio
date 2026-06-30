"use client"

import * as React from "react"

import { useResolvedTerminalTheme } from "@/hooks/use-resolved-terminal-theme"
import { cn } from "@/lib/utils"

/** Claude thinking spinner — cycles in this order (claude.ai / Claude Code). */
export const CLAUDE_THINKING_FRAMES = [
  "\u00B7", // middle dot / bullet
  "\u273B", // teardrop-spoked asterisk ✻
  "\u273D", // heavy teardrop-spoked asterisk ✽
  "\u2736", // six pointed black star ✶
  "\u2733", // eight spoked asterisk ✳
  "\u2722", // four balloon-spoked asterisk ✢
] as const

export type TerminalAsciiSpinnerProps = {
  /** Single-character frames cycled in order. */
  frames?: ReadonlyArray<string>
  /** Milliseconds per frame. */
  speed?: number
  color?: string
  className?: string
}

export function TerminalAsciiSpinner({
  frames = CLAUDE_THINKING_FRAMES,
  speed = 150,
  color = "var(--terminal-teal)",
  className,
}: TerminalAsciiSpinnerProps) {
  const [step, setStep] = React.useState(0)
  const [reduceMotion, setReduceMotion] = React.useState(false)
  const frameCount = Math.max(1, frames.length)

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduceMotion(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  React.useEffect(() => {
    if (reduceMotion) return

    const interval = window.setInterval(() => {
      setStep((current) => (current + 1) % frameCount)
    }, Math.max(16, speed))

    return () => window.clearInterval(interval)
  }, [reduceMotion, speed, frameCount])

  const frame = frames[reduceMotion ? 0 : step % frameCount] ?? frames[0] ?? "·"

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex w-[1em] shrink-0 items-center justify-center font-mono leading-none",
        className
      )}
      style={{ color }}
    >
      {frame}
    </span>
  )
}

// 3x3 grid (row-major indices). The 8 perimeter cells form a clockwise ring
// swept by a comet head with a fading trail; the center (index 4) pulses as a
// core in sync with each revolution.
const DOT_GRID_SIZE = 9
const DOT_RING = [0, 1, 2, 5, 8, 7, 6, 3]
const DOT_CENTER = 4

/** A custom animation frame: opacity (0–1) per grid cell, row-major (length 9). */
export type TerminalDotFrame = ReadonlyArray<number>

export type TerminalDotMatrixProps = {
  tone?: "default" | "active"
  /** Milliseconds per step (lower is faster). */
  speed?: number
  /** Number of cells that fade behind the comet head. (Built-in spin only.) */
  trail?: number
  /** Pulse the center dot as a core. (Built-in spin only.) */
  pulseCenter?: boolean
  /** Dot size in pixels. */
  dotSize?: number
  /** Override the dot color (any CSS color). Defaults to the tone color. */
  color?: string
  /**
   * Custom animation as a list of frames, each an array of opacity values
   * (0–1) for the 3x3 grid in row-major order. Overrides the built-in spin.
   */
  frames?: ReadonlyArray<TerminalDotFrame>
  className?: string
}

function clampOpacity(value: number | undefined) {
  if (value == null || Number.isNaN(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function TerminalDotMatrix({
  tone = "default",
  speed = 120,
  trail = 4,
  pulseCenter = true,
  dotSize = 2,
  color,
  frames,
  className,
}: TerminalDotMatrixProps) {
  const [step, setStep] = React.useState(0)
  const [reduceMotion, setReduceMotion] = React.useState(false)

  const hasCustomFrames = Boolean(frames && frames.length > 0)
  const frameCount = hasCustomFrames ? frames!.length : DOT_RING.length

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduceMotion(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  React.useEffect(() => {
    if (reduceMotion) return

    const interval = window.setInterval(() => {
      setStep((current) => (current + 1) % frameCount)
    }, Math.max(16, speed))

    return () => window.clearInterval(interval)
  }, [reduceMotion, speed, frameCount])

  const dotColor =
    color ??
    (tone === "active" ? "var(--terminal-blue-bright)" : "var(--terminal-white)")

  const opacities = new Array<number>(DOT_GRID_SIZE).fill(0)

  if (hasCustomFrames) {
    const frame = frames![(reduceMotion ? 0 : step) % frames!.length] ?? []
    for (let index = 0; index < DOT_GRID_SIZE; index += 1) {
      opacities[index] = clampOpacity(frame[index])
    }
  } else {
    const head = reduceMotion ? 0 : step % DOT_RING.length
    const safeTrail = Math.max(1, trail)
    DOT_RING.forEach((cellIndex, ringPos) => {
      const distance = (head - ringPos + DOT_RING.length) % DOT_RING.length
      opacities[cellIndex] = distance < safeTrail ? 1 - distance / safeTrail : 0
    })

    if (pulseCenter) {
      const phase = head / DOT_RING.length
      opacities[DOT_CENTER] =
        0.3 + 0.45 * (0.5 + 0.5 * Math.cos(2 * Math.PI * phase))
    }
  }

  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 align-middle leading-none", className)}
      style={{
        gridTemplateColumns: `repeat(3, ${dotSize}px)`,
        gridTemplateRows: `repeat(3, ${dotSize}px)`,
        gap: 1,
      }}
    >
      {opacities.map((opacity, index) => (
        <span
          key={index}
          className="rounded-full"
          style={{
            width: dotSize,
            height: dotSize,
            backgroundColor: dotColor,
            opacity,
            transition: `opacity ${Math.max(16, speed)}ms linear`,
          }}
        />
      ))}
    </span>
  )
}

export type ThinkingIndicatorProps = {
  label?: string
  children?: React.ReactNode
  /**
   * `auto` — Claude symbol loop inside `.terminal-theme-claude`, dot matrix elsewhere.
   * `ascii` — always use the symbol loop. `dots` / `cursor` — force that style.
   */
  variant?: "auto" | "dots" | "ascii" | "cursor"
  tone?: "default" | "active"
  /** Customize the dot-matrix animation (speed, trail, color, etc.). */
  dotProps?: Omit<TerminalDotMatrixProps, "tone" | "className">
  /** Customize the Claude-style ASCII symbol loop. */
  asciiProps?: Omit<TerminalAsciiSpinnerProps, "className">
  /**
   * SessionContent integration — skip the streaming queue and pin this line at the
   * transcript tail (e.g. live thinking). Not read by ThinkingIndicator; SessionContent
   * inspects the prop on the child element.
   */
  sessionTail?: boolean
  className?: string
}

export function ThinkingIndicator({
  label,
  children,
  variant = "auto",
  tone = "default",
  dotProps,
  asciiProps,
  sessionTail: _sessionTail,
  className,
}: ThinkingIndicatorProps) {
  const content = children ?? label
  const { ref, isClaude, isCompact } = useResolvedTerminalTheme()
  const useAscii = variant === "ascii" || (variant === "auto" && isClaude)
  const useCursor = variant === "cursor" || (variant === "auto" && isCompact)
  const asciiColor = asciiProps?.color ?? "var(--terminal-teal)"
  const textColor = useAscii
    ? asciiColor
    : tone === "active"
      ? "var(--terminal-white)"
      : "var(--terminal-dim)"

  return (
    <div
      ref={ref}
      className={cn("flex items-center gap-2.5 text-[12px]", className)}
      role="status"
      aria-live="polite"
    >
      {useCursor ? (
        <span
          aria-hidden
          className="terminal-cursor inline-block h-3 w-[0.55em]"
          style={{ backgroundColor: "var(--terminal-progress-fill)" }}
        />
      ) : useAscii ? (
        <TerminalAsciiSpinner {...asciiProps} color={asciiColor} />
      ) : (
        <TerminalDotMatrix tone={tone} {...dotProps} />
      )}
      {content && <span style={{ color: textColor }}>{content}</span>}
    </div>
  )
}

/** @deprecated Use ThinkingIndicator */
export type BusyIndicatorProps = ThinkingIndicatorProps

/** @deprecated Use ThinkingIndicator */
export function BusyIndicator(props: ThinkingIndicatorProps) {
  return <ThinkingIndicator {...props} />
}
