"use client"

import { IconBolt as Zap } from "nucleo-pixel"
import * as React from "react"

import { useResolvedTerminalTheme } from "@/hooks/use-resolved-terminal-theme"
import { cn } from "@/lib/utils"

/** Default composer meta — lightning level indicator (e.g. max). */
export function InputLevelMeta({ children = "max" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Zap className="size-3 shrink-0" aria-hidden />
      {children}
    </span>
  )
}

export type InputProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  onSubmit?: (value: string) => void
  prompt?: string
  status?: React.ReactNode
  /** Footer hint on the left — composer (default) and Claude stacked layouts. */
  metaLeft?: React.ReactNode
  /** Footer hint on the right — composer (default) and Claude stacked layouts. */
  metaRight?: React.ReactNode
  placeholder?: string
  disabled?: boolean
  /** Keep the blinking cursor visible even when unfocused. */
  showCursor?: boolean
  /**
   * `auto` — composer on default, inline box on grok, stacked lines on Claude.
   * `inline` — status on the right in a bordered box. `stacked` — always stacked.
   */
  layout?: "auto" | "inline" | "stacked"
  className?: string
}

function refocusTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return
  textarea.focus()
  requestAnimationFrame(() => {
    textarea.focus()
    requestAnimationFrame(() => textarea.focus())
  })
}

export const Input = React.forwardRef<HTMLTextAreaElement, InputProps>(function Input(
  {
    value,
    defaultValue = "",
    onValueChange,
    onSubmit,
    prompt,
    status,
    metaLeft,
    metaRight,
    placeholder,
    disabled = false,
    showCursor = false,
    layout = "auto",
    className,
  },
  ref
) {
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const [focused, setFocused] = React.useState(false)
  const [caretLeft, setCaretLeft] = React.useState(0)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const mirrorRef = React.useRef<HTMLSpanElement>(null)
  const { ref: themeRef, isClaude, isBubble } = useResolvedTerminalTheme()
  const currentValue = value ?? internalValue

  const stacked = layout === "stacked" || (layout === "auto" && isClaude)
  const composer = layout === "auto" && isBubble
  const inline = !stacked && !composer
  const resolvedPrompt = prompt ?? "❯"
  const footerRight = metaRight ?? (stacked ? status : undefined)
  const showComposerMeta =
    composer && (metaLeft != null || metaRight != null || status != null)
  const showStackedFooter = stacked && (metaLeft != null || footerRight != null)
  const textColor = stacked ? "var(--terminal-fg)" : "var(--terminal-white)"
  const promptColor = "var(--terminal-teal)"
  const cursorColor = stacked ? "var(--terminal-fg)" : "var(--terminal-progress-fill)"
  const fieldLineHeight = stacked ? 18 : 16
  const cursorHeight = stacked ? 13 : 12

  React.useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement)

  const syncCaretPosition = React.useCallback(() => {
    const textarea = textareaRef.current
    const mirror = mirrorRef.current
    if (!textarea || !mirror) return

    const selectionStart = textarea.selectionStart ?? currentValue.length
    mirror.textContent = currentValue.slice(0, selectionStart) || "\u200b"
    setCaretLeft(mirror.offsetWidth)
  }, [currentValue])

  React.useLayoutEffect(() => {
    syncCaretPosition()
  }, [syncCaretPosition])

  const handleChange = (next: string) => {
    if (value === undefined) setInternalValue(next)
    onValueChange?.(next)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (!currentValue.trim() || disabled) return
      onSubmit?.(currentValue)
      refocusTextarea(textareaRef.current)
    }
  }

  const field = (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 overflow-hidden",
        stacked ? "gap-2.5" : undefined
      )}
      style={{ color: textColor }}
    >
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center"
        style={{
          color: promptColor,
          fontSize: 9,
          lineHeight: `${fieldLineHeight}px`,
        }}
      >
        {resolvedPrompt}
      </span>
      <span
        className="relative flex min-w-0 flex-1 items-center overflow-hidden"
        style={{ lineHeight: `${fieldLineHeight}px`, minHeight: fieldLineHeight }}
      >
        <span
          ref={mirrorRef}
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 whitespace-pre text-[11px] leading-4"
        />
        <textarea
          ref={textareaRef}
          value={currentValue}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onKeyUp={syncCaretPosition}
          onSelect={syncCaretPosition}
          onClick={syncCaretPosition}
          onFocus={() => {
            setFocused(true)
            syncCaretPosition()
          }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          spellCheck={false}
          className={cn(
            "terminal-input-control block w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-inherit text-[11px] leading-4 caret-transparent outline-none"
          )}
          style={{
            color: textColor,
            minHeight: fieldLineHeight,
            maxHeight: fieldLineHeight,
          }}
        />
        {!disabled && (focused || showCursor) ? (
          <span
            aria-hidden
            className="terminal-cursor pointer-events-none absolute top-1/2 inline-block w-[0.55em] shrink-0 -translate-y-1/2"
            style={{
              left: caretLeft,
              height: cursorHeight,
              backgroundColor: cursorColor,
            }}
          />
        ) : null}
      </span>
      {inline && status ? (
        <div
          className="shrink-0 whitespace-nowrap text-[11px]"
          style={{ color: "var(--terminal-dim)" }}
        >
          {status}
        </div>
      ) : null}
    </div>
  )

  const fieldShell = (
    <div
      className={cn(
        "terminal-input-field flex items-center",
        stacked && "terminal-input-field--stacked px-0",
        composer && "terminal-input-field--composer terminal-panel gap-3 border px-3 py-2.5 sm:px-4",
        inline && "gap-3 rounded border px-3 py-2 sm:px-4"
      )}
      style={
        stacked
          ? undefined
          : {
              borderColor: "var(--terminal-border)",
              backgroundColor: "var(--terminal-input-bg)",
            }
      }
    >
      {field}
    </div>
  )

  return (
    <div
      ref={themeRef}
      className={cn("terminal-input w-full text-[11px]", className)}
      onClick={() => textareaRef.current?.focus()}
    >
      {composer ? (
        <div className="terminal-input-composer">
          {fieldShell}
          {showComposerMeta ? (
            <div className="terminal-input-meta-layer flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{metaLeft}</span>
              <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                {metaRight}
                {status}
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {fieldShell}
          {showStackedFooter ? (
            <div
              className="terminal-input-meta mt-1.5 flex items-center justify-between gap-3 text-[11px] leading-4"
              style={{ color: "var(--terminal-dim)" }}
            >
              <span className="min-w-0 truncate">{metaLeft}</span>
              <span className="shrink-0 whitespace-nowrap">{footerRight}</span>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
})

/** @deprecated Use Input */
export type ShellInputProps = InputProps

/** @deprecated Use Input */
export const ShellInput = React.forwardRef<HTMLTextAreaElement, InputProps>(
  function ShellInput(props, ref) {
    return <Input {...props} ref={ref} />
  }
)

export type CommandSuggestProps = {
  commands: string[]
  activeIndex?: number
  onSelect?: (command: string) => void
  className?: string
}

export function CommandSuggest({
  commands,
  activeIndex = 0,
  onSelect,
  className,
}: CommandSuggestProps) {
  return (
    <div
      className={cn("terminal-panel overflow-hidden border font-mono text-xs", className)}
      style={{
        borderColor: "var(--terminal-border)",
        backgroundColor: "var(--terminal-popover)",
      }}
    >
      {commands.map((command, index) => (
        <button
          key={command}
          type="button"
          onClick={() => onSelect?.(command)}
          className="flex w-full items-center px-3 py-1.5 text-left"
          style={{
            color:
              index === activeIndex ? "var(--terminal-white)" : "var(--terminal-dim)",
            backgroundColor:
              index === activeIndex ? "var(--terminal-panel-strong)" : "transparent",
          }}
        >
          <span style={{ color: "var(--terminal-green)" }}>/</span>
          {command.replace(/^\//, "")}
        </button>
      ))}
    </div>
  )
}
