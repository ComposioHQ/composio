"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type TerminalBodyScrollProps = {
  fill?: boolean
  pinBottom?: boolean
  stickToBottom?: boolean
  children: React.ReactNode
}

function pinScrollElement(element: HTMLElement) {
  element.scrollTop = element.scrollHeight
}

function pinScrollElementSoon(element: HTMLElement) {
  pinScrollElement(element)
  requestAnimationFrame(() => {
    pinScrollElement(element)
    requestAnimationFrame(() => pinScrollElement(element))
  })
}

export function TerminalBodyScroll({
  fill,
  pinBottom = false,
  stickToBottom = false,
  children,
}: TerminalBodyScrollProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!stickToBottom) return

    const el = scrollRef.current
    if (!el) return

    const pin = () => pinScrollElementSoon(el)

    pin()

    const observer = new ResizeObserver(pin)
    observer.observe(el)
    if (el.firstElementChild) {
      observer.observe(el.firstElementChild)
    }

    return () => observer.disconnect()
  }, [stickToBottom, children])

  return (
    <div
      className={cn(
        "terminal-body-scroll-host",
        fill && "min-h-0 flex-1 overflow-hidden"
      )}
    >
      <div
        ref={scrollRef}
        className={cn(
          "terminal-body-scroll",
          fill && "min-h-0 flex-1",
          pinBottom && "terminal-body-scroll-pin-bottom"
        )}
      >
        {children}
      </div>
    </div>
  )
}
