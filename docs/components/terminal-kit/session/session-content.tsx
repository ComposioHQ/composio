"use client"

import { motion, useReducedMotion } from "motion/react"
import * as React from "react"

import { cn } from "@/lib/utils"

import { Message } from "./message"
import { BusyIndicator, ThinkingIndicator } from "../ui/thinking-indicator"
import { StreamText, estimateStreamDurationMs, type TextStreamMode } from "../ui/stream-text"

const SESSION_EASE = [0.23, 1, 0.32, 1] as const

function isSentPrompt(child: React.ReactNode) {
  if (!React.isValidElement(child)) return false
  return child.type === Message
}

function isThinkingIndicator(child: React.ReactNode) {
  if (!React.isValidElement(child)) return false
  return child.type === ThinkingIndicator || child.type === BusyIndicator
}

function isStreamText(child: React.ReactNode) {
  if (!React.isValidElement(child)) return false
  return child.type === StreamText
}

/** Tail lines (e.g. live thinking) skip the streaming queue and stay last. */
function isSessionTail(child: React.ReactNode) {
  if (!React.isValidElement(child)) return false
  return (child.props as { sessionTail?: boolean }).sessionTail === true
}

function sessionItemKey(resetKey: React.Key, index: number) {
  return `${String(resetKey)}-${index}`
}

function usesManualSessionInset(child: React.ReactNode) {
  if (!React.isValidElement(child)) return false
  const props = child.props as {
    "data-session-inset"?: string
    sessionInset?: "manual"
  }
  return (
    props["data-session-inset"] === "manual" || props.sessionInset === "manual"
  )
}

function shouldApplySessionInset(child: React.ReactNode) {
  if (isSentPrompt(child)) return false
  if (isThinkingIndicator(child)) return false
  if (usesManualSessionInset(child)) return false
  return true
}

function getScrollContainer(node: HTMLElement | null) {
  return node?.closest(".terminal-body-scroll") as HTMLElement | null
}

function getPauseAfter(child: React.ReactNode, fallbackMs: number) {
  if (!React.isValidElement(child)) return fallbackMs

  const props = child.props as {
    sessionPause?: number
    duration?: string
    streaming?: boolean
    steps?: unknown[]
    name?: string
    file?: string
    children?: string
    level?: string
  }

  if (typeof props.sessionPause === "number") return props.sessionPause

  if (isStreamText(child)) {
    const streamProps = child.props as {
      mode?: TextStreamMode
      speed?: number
      children?: string
      segmentDelay?: number
      fadeDuration?: number
    }
    if (typeof streamProps.children === "string") {
      return estimateStreamDurationMs(streamProps.children, {
        mode: streamProps.mode,
        speed: streamProps.speed,
        segmentDelay: streamProps.segmentDelay,
        fadeDuration: streamProps.fadeDuration,
      })
    }
  }

  if (typeof props.duration === "string") {
    const match = props.duration.match(/([\d.]+)\s*s/)
    if (match?.[1]) return Math.round(parseFloat(match[1]) * 1000)
  }

  if (props.streaming && Array.isArray(props.steps)) {
    return props.steps.length * 420 + 240
  }

  if (props.streaming && props.name) return 820

  if (typeof props.file === "string") return 520

  if (props.streaming && typeof props.children === "string") {
    const lines = props.children.split("\n").filter((line) => line.trim().length > 0)
    return lines.length * 300 + 240
  }

  if (props.level) return 320

  if (isSentPrompt(child)) return 280

  return fallbackMs
}

export type SessionLineProps = {
  children: React.ReactNode
  className?: string
  onReveal?: () => void
}

/** Animate a single session line on mount. */
export function SessionLine({
  children,
  className,
  onReveal,
}: SessionLineProps) {
  const reduceMotion = useReducedMotion()

  React.useEffect(() => {
    if (reduceMotion) onReveal?.()
  }, [onReveal, reduceMotion])

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        ease: SESSION_EASE,
      }}
      onAnimationComplete={onReveal}
    >
      {children}
    </motion.div>
  )
}

export type SessionContentProps = {
  children: React.ReactNode
  className?: string
  /** Fallback pause between items when streaming (seconds). */
  stagger?: number
  /** Seconds before the first streamed item appears. */
  delay?: number
  /** Change to replay the enter sequence. */
  resetKey?: React.Key
  /** Keep the scroll container pinned to the bottom as lines appear. */
  autoScroll?: boolean
  /** Reveal children one at a time like a live agent session. */
  streaming?: boolean
}

/** Staggered enter animation for agent session content. */
export function SessionContent({
  children,
  className,
  stagger = 0.45,
  delay = 0,
  resetKey = "session",
  autoScroll = false,
  streaming = false,
}: SessionContentProps) {
  const reduceMotion = useReducedMotion()
  const sessionRef = React.useRef<HTMLDivElement>(null)
  const allItems = React.Children.toArray(children).filter(Boolean)
  const bodyItems = allItems.filter((child) => !isSessionTail(child))
  const tailItems = allItems.filter((child) => isSessionTail(child))
  const itemsRef = React.useRef(bodyItems)
  React.useEffect(() => {
    itemsRef.current = bodyItems
  })

  const [revealedCount, setRevealedCount] = React.useState(0)

  // Replay the staggered reveal when the reset key or body count changes.
  const revealKey = `${String(resetKey)}:${bodyItems.length}:${streaming}:${reduceMotion}`
  const [prevRevealKey, setPrevRevealKey] = React.useState(revealKey)
  if (revealKey !== prevRevealKey) {
    setPrevRevealKey(revealKey)
    setRevealedCount(0)
  }

  const scrollToBottom = React.useCallback(
    (behavior?: ScrollBehavior) => {
      const scrollEl = getScrollContainer(sessionRef.current)
      const resolved =
        behavior ?? (reduceMotion || streaming ? "auto" : "smooth")
      scrollEl?.scrollTo({ top: scrollEl.scrollHeight, behavior: resolved })
    },
    [reduceMotion, streaming]
  )

  React.useEffect(() => {
    if (!streaming || reduceMotion) return

    let cancelled = false
    const timers: number[] = []

    const showThrough = (count: number) => {
      if (cancelled) return
      setRevealedCount(count)
      if (autoScroll) scrollToBottom(count === 1 ? "auto" : "smooth")
    }

    const revealFrom = (index: number) => {
      if (cancelled || index >= itemsRef.current.length) return
      showThrough(index + 1)

      if (index + 1 >= itemsRef.current.length) return

      const pause = getPauseAfter(itemsRef.current[index], stagger * 1000)
      timers.push(window.setTimeout(() => revealFrom(index + 1), pause))
    }

    timers.push(
      window.setTimeout(() => revealFrom(0), Math.max(0, delay * 1000))
    )

    return () => {
      cancelled = true
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [
    streaming,
    resetKey,
    bodyItems.length,
    delay,
    stagger,
    reduceMotion,
    autoScroll,
    scrollToBottom,
  ])

  React.useEffect(() => {
    if (!autoScroll || streaming) return
    scrollToBottom("auto")
  }, [autoScroll, streaming, bodyItems.length, tailItems.length, resetKey, scrollToBottom])

  // Pin to bottom while transcript height grows (StreamText typing, etc.).
  React.useEffect(() => {
    if (!autoScroll) return
    const node = sessionRef.current
    if (!node) return

    const observer = new ResizeObserver(() => {
      scrollToBottom(streaming ? "auto" : "smooth")
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [autoScroll, scrollToBottom, streaming, resetKey])

  const handleLineReveal = React.useCallback(() => {
    if (autoScroll) scrollToBottom()
  }, [autoScroll, scrollToBottom])

  const visibleBodyItems =
    streaming && !reduceMotion ? bodyItems.slice(0, revealedCount) : bodyItems

  const renderTailItems = () =>
    tailItems.map((child, index) => (
      <div
        key={sessionItemKey(`${String(resetKey)}-tail`, index)}
        className={shouldApplySessionInset(child) ? "terminal-session-inset" : undefined}
      >
        {child}
      </div>
    ))

  if (reduceMotion) {
    return (
      <div ref={sessionRef} className={cn("terminal-session", className)}>
        {visibleBodyItems.map((child, index) => (
          <div
            key={sessionItemKey(resetKey, index)}
            className={shouldApplySessionInset(child) ? "terminal-session-inset" : undefined}
          >
            {child}
          </div>
        ))}
        {renderTailItems()}
      </div>
    )
  }

  return (
    <div ref={sessionRef} className={cn("terminal-session", className)}>
      {visibleBodyItems.map((child, index) => (
        <SessionLine
          key={sessionItemKey(resetKey, index)}
          className={shouldApplySessionInset(child) ? "terminal-session-inset" : undefined}
          onReveal={autoScroll && !streaming ? handleLineReveal : undefined}
        >
          {child}
        </SessionLine>
      ))}
      {renderTailItems()}
    </div>
  )
}
