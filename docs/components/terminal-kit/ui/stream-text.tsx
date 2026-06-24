"use client"

import { motion, useReducedMotion } from "motion/react"
import * as React from "react"

import { TerminalLine } from "../shell/terminal-line"

export type TextStreamMode = "plain" | "fade"

export type TextSegment = { text: string; index: number }

export type StreamTimingOverrides = {
  /** Delay between word segments, ms (overrides speed). */
  segmentDelay?: number
  /** Fade-in duration per segment in fade mode, ms (overrides speed). */
  fadeDuration?: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** Map a 1-100 speed knob to concrete timings. */
export function resolveStreamTiming(
  speed = 20,
  overrides: StreamTimingOverrides = {}
) {
  const s = clamp(speed, 1, 100)
  return {
    segmentDelay: overrides.segmentDelay ?? Math.max(16, Math.round(170 - s * 1.4)),
    fadeDuration: overrides.fadeDuration ?? Math.max(120, Math.round(700 - s * 4)),
  }
}

/** Split into words while keeping trailing whitespace so spacing is preserved. */
function splitSegments(text: string): TextSegment[] {
  const matches = text.match(/\S+\s*/g) ?? []
  return matches.map((segment, index) => ({ text: segment, index }))
}

/** Estimate how long a stream will take, e.g. to drive a SessionContent pause. */
export function estimateStreamDurationMs(
  text: string,
  options: { mode?: TextStreamMode; speed?: number } & StreamTimingOverrides = {}
) {
  const { mode = "plain", speed = 20, ...overrides } = options
  const timing = resolveStreamTiming(speed, overrides)
  const base =
    splitSegments(text).length * timing.segmentDelay + 120
  if (mode === "plain") return base
  return base + timing.fadeDuration
}

export type UseTextStreamOptions = {
  text: string
  mode?: TextStreamMode
  /** 1 (slowest) to 100 (fastest). Defaults to 20. */
  speed?: number
  /** When false, nothing is revealed. */
  enabled?: boolean
  /** Reveal the full text immediately (e.g. reduced motion). */
  instant?: boolean
  onComplete?: () => void
} & StreamTimingOverrides

/**
 * Client-side simulated text streaming. For controlled/fake progressive output
 * (demos, scripted sessions). For real LLM output, append tokens directly.
 */
export function useTextStream({
  text,
  mode = "plain",
  speed = 20,
  enabled = true,
  instant = false,
  segmentDelay,
  fadeDuration,
  onComplete,
}: UseTextStreamOptions) {
  const timing = resolveStreamTiming(speed, { segmentDelay, fadeDuration })
  const segments = React.useMemo(() => splitSegments(text), [text])
  const useFade = mode === "fade" && !instant
  const streamWords = enabled && !instant && segments.length > 0

  const initialSegments = enabled && !streamWords ? segments.length : 0
  const [segmentCount, setSegmentCount] = React.useState(initialSegments)

  const resetKey = `${text}::${mode}::${enabled}::${instant}`
  const [prevResetKey, setPrevResetKey] = React.useState(resetKey)
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey)
    setSegmentCount(initialSegments)
  }

  const onCompleteRef = React.useRef(onComplete)
  React.useEffect(() => {
    onCompleteRef.current = onComplete
  })

  React.useEffect(() => {
    if (!streamWords) return
    let cancelled = false
    let revealed = 0
    let timer = 0

    const tick = () => {
      if (cancelled) return
      revealed += 1
      setSegmentCount(revealed)
      if (revealed < segments.length) {
        timer = window.setTimeout(tick, timing.segmentDelay)
      }
    }

    timer = window.setTimeout(tick, timing.segmentDelay)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [streamWords, text, segments.length, timing.segmentDelay])

  const isComplete =
    !enabled ? false : instant || segmentCount >= segments.length

  const completedRef = React.useRef(false)
  React.useEffect(() => {
    if (isComplete && !completedRef.current) {
      completedRef.current = true
      onCompleteRef.current?.()
    } else if (!isComplete) {
      completedRef.current = false
    }
  }, [isComplete])

  return {
    segments,
    visibleSegmentCount: segmentCount,
    isComplete,
    timing,
    useFade,
    streamWords,
  }
}

export type StreamTextProps = {
  /** The text to stream. Must be a plain string. */
  children: string
  /** `plain` (default) reveals word-by-word; `fade` adds a fade-in per word. */
  mode?: TextStreamMode
  /** 1 (slowest) to 100 (fastest). Defaults to 26. */
  speed?: number
  /** Start streaming. Set false to hold until revealed. */
  enabled?: boolean
  className?: string
  onComplete?: () => void
  /**
   * SessionContent integration — ms to wait after this line before revealing the
   * next child when streaming. Not read by StreamText; SessionContent inspects
   * the prop on the child element. Defaults to estimateStreamDurationMs(text).
   */
  sessionPause?: number
} & StreamTimingOverrides

/**
 * Agent text inside a TerminalLine. Default reveals word-by-word with no
 * transition; use mode="fade" to fade each word in.
 */
export function StreamText({
  children,
  mode = "plain",
  speed = 26,
  enabled = true,
  className,
  onComplete,
  sessionPause: _sessionPause,
  segmentDelay,
  fadeDuration,
}: StreamTextProps) {
  const reduceMotion = useReducedMotion()
  const { segments, visibleSegmentCount, timing, useFade, streamWords } =
    useTextStream({
      text: children,
      mode,
      speed,
      enabled,
      instant: Boolean(reduceMotion),
      segmentDelay,
      fadeDuration,
      onComplete,
    })

  if (!enabled) {
    return <TerminalLine className={className} />
  }

  if (!streamWords) {
    return (
      <TerminalLine className={className}>
        {children}
      </TerminalLine>
    )
  }

  if (useFade) {
    return (
      <TerminalLine className={className}>
        {segments.map((segment) => {
          const visible = segment.index < visibleSegmentCount
          return (
            <motion.span
              key={segment.index}
              initial={false}
              animate={{ opacity: visible ? 1 : 0 }}
              transition={{
                duration: timing.fadeDuration / 1000,
                ease: "easeOut",
              }}
            >
              {segment.text}
            </motion.span>
          )
        })}
      </TerminalLine>
    )
  }

  return (
    <TerminalLine className={className}>
      {segments.map((segment) => {
        const visible = segment.index < visibleSegmentCount
        return (
          <span
            key={segment.index}
            aria-hidden={!visible}
            style={{ visibility: visible ? "visible" : "hidden" }}
          >
            {segment.text}
          </span>
        )
      })}
    </TerminalLine>
  )
}
