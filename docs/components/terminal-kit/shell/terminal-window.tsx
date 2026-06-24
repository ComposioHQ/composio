import * as React from "react"

import {
  terminalThemeClass,
  terminalThemeLightClass,
  type TerminalTheme,
} from "@/lib/terminal-themes"
import { cn } from "@/lib/utils"

import { TerminalBodyScroll } from "./terminal-body-scroll"

export type { TerminalTheme } from "@/lib/terminal-themes"

export type TerminalProgressConfig = {
  value: number
  /** Label beside the bar — e.g. "context". */
  label?: React.ReactNode
  /** Show the numeric percentage after the bar. Defaults to false when label is set. */
  showValue?: boolean
}

export type TerminalProgress = number | TerminalProgressConfig | false

function resolveProgress(progress: TerminalProgress | undefined) {
  if (progress === false || progress === undefined) return null

  if (typeof progress === "number") {
    return { value: progress, label: undefined, showValue: true }
  }

  return {
    value: progress.value,
    label: progress.label,
    showValue: progress.showValue ?? progress.label == null,
  }
}

export type TerminalBodyProps = React.HTMLAttributes<HTMLDivElement> & {
  footer?: React.ReactNode
  header?: React.ReactNode
  /** Stretch to fill a fixed-height window and scroll internally. Defaults to content-height flow. */
  fill?: boolean
  pinScrollBottom?: boolean
}

function TerminalBodyLayout({
  className,
  children,
  footer,
  header,
  fill = false,
  pinScrollBottom = false,
  ...props
}: TerminalBodyProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col justify-start overflow-hidden",
        fill ? "min-h-0 flex-1" : "shrink-0",
        className
      )}
      {...props}
    >
      {header ? (
        <div className="terminal-body-header w-full shrink-0 px-[var(--terminal-session-pad-x)]">
          {header}
        </div>
      ) : null}
      <TerminalBodyScroll
        fill={fill}
        pinBottom={pinScrollBottom}
        stickToBottom={pinScrollBottom}
      >
        <div
          className={cn(
            "terminal-body-content w-full",
            pinScrollBottom ? "flex min-h-full flex-col justify-end" : "min-h-0"
          )}
        >
          {children}
        </div>
      </TerminalBodyScroll>
      {footer ? (
        <div className="terminal-body-footer w-full shrink-0 pb-[var(--terminal-session-pad-y)]">
          {footer}
        </div>
      ) : null}
    </div>
  )
}

export type TerminalWindowProps = React.HTMLAttributes<HTMLDivElement> & {
  path?: string
  /** Pass `false` to hide the header progress indicator. */
  progress?: TerminalProgress
  showTrafficLights?: boolean
  /** Built-in palette — default, grok, or claude. */
  theme?: TerminalTheme
  variant?: "dark" | "light"
  footer?: React.ReactNode
  header?: React.ReactNode
  /** Stretch to fill a fixed-height window and scroll internally. */
  fill?: boolean
  pinScrollBottom?: boolean
  /** Classes for the inner body layout wrapper. */
  bodyClassName?: string
  /** Optional control rendered at the end of the window chrome header. */
  headerAction?: React.ReactNode
}

export function TerminalWindow({
  path,
  progress,
  showTrafficLights = true,
  theme = "default",
  variant = "dark",
  className,
  children,
  style,
  footer,
  header,
  fill = false,
  pinScrollBottom = false,
  bodyClassName,
  headerAction,
  ...props
}: TerminalWindowProps) {
  const resolvedProgress = resolveProgress(progress)

  return (
    <div
      className={cn(
        "terminal-theme flex w-full min-h-0 flex-col overflow-hidden border font-mono text-xs leading-relaxed",
        terminalThemeClass(theme),
        variant === "light" && terminalThemeLightClass(theme),
        className
      )}
      style={{
        backgroundColor: "var(--terminal-editor-bg)",
        borderColor: "var(--terminal-border)",
        borderRadius: "var(--terminal-radius-window)",
        color: "var(--terminal-fg)",
        ...style,
      }}
      {...props}
    >
      {(path || resolvedProgress || showTrafficLights || headerAction) && (
        <TerminalHeader
          path={path}
          progress={resolvedProgress ?? undefined}
          showTrafficLights={showTrafficLights}
          headerAction={headerAction}
        />
      )}
      <TerminalBodyLayout
        className={bodyClassName}
        fill={fill}
        footer={footer}
        header={header}
        pinScrollBottom={pinScrollBottom}
      >
        {children}
      </TerminalBodyLayout>
    </div>
  )
}

/** @deprecated Pass footer, header, fill, and pinScrollBottom to TerminalWindow instead. */
export function TerminalBody(props: TerminalBodyProps) {
  return <TerminalBodyLayout {...props} />
}

export type TerminalHeaderProps = {
  path?: string
  progress?: {
    value: number
    label?: React.ReactNode
    showValue: boolean
  }
  showTrafficLights?: boolean
  className?: string
  headerAction?: React.ReactNode
  /** @default true */
  showBorderBottom?: boolean
}

function TerminalHeaderProgress({
  progress,
  label,
  showValue,
}: {
  progress: number
  label?: React.ReactNode
  showValue: boolean
}) {
  const ariaLabel =
    label != null && label !== "" ? String(label) : "Progress"

  return (
    <div className="flex shrink-0 items-center gap-2 text-[11px]">
      <span style={{ color: "var(--terminal-vdim)" }}>|</span>
      {label ? (
        <span className="shrink-0" style={{ color: "var(--terminal-dim)" }}>
          {label}
        </span>
      ) : null}
      <span
        className="relative inline-flex h-[1em] w-16 items-stretch overflow-hidden terminal-panel-sm"
        style={{ backgroundColor: "var(--terminal-progress-track)" }}
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={showValue ? `${ariaLabel} ${progress.toFixed(2)}%` : ariaLabel}
      >
        <span
          className="block h-full"
          style={{
            width: `${Math.min(100, Math.max(0, progress))}%`,
            backgroundColor: "var(--terminal-progress-fill)",
          }}
        />
      </span>
      {showValue ? (
        <span style={{ color: "var(--terminal-dim)" }}>{progress.toFixed(2)}%</span>
      ) : null}
    </div>
  )
}

export function TerminalHeader({
  path,
  progress,
  showTrafficLights = true,
  className,
  headerAction,
  showBorderBottom = true,
}: TerminalHeaderProps) {
  return (
    <div
      className={cn("flex items-center gap-3 px-3 py-2", className)}
      style={
        showBorderBottom
          ? { borderBottom: "1px solid var(--terminal-border)" }
          : undefined
      }
    >
      {showTrafficLights && (
        <div className="terminal-traffic-lights flex shrink-0 gap-1.5">
          <div
            className="size-[9px] rounded-full"
            style={{ backgroundColor: "var(--terminal-traffic-red)" }}
          />
          <div
            className="size-[9px] rounded-full"
            style={{ backgroundColor: "var(--terminal-traffic-yellow)" }}
          />
          <div
            className="size-[9px] rounded-full"
            style={{ backgroundColor: "var(--terminal-traffic-green)" }}
          />
        </div>
      )}
      {path && (
        <div
          className="ml-1.5 min-w-0 flex-1 truncate text-[11px]"
          style={{ color: "var(--terminal-dim)" }}
        >
          {path}
        </div>
      )}
      {progress && (
        <TerminalHeaderProgress
          progress={progress.value}
          label={progress.label}
          showValue={progress.showValue}
        />
      )}
      {headerAction ? <div className="ml-auto shrink-0">{headerAction}</div> : null}
    </div>
  )
}

export type TerminalStatusBarProps = React.HTMLAttributes<HTMLDivElement> & {
  left?: React.ReactNode
  right?: React.ReactNode
}

export function TerminalStatusBar({
  left,
  right,
  className,
  children,
  ...props
}: TerminalStatusBarProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 text-[11px]",
        className
      )}
      style={{
        borderTop: "1px solid var(--terminal-border)",
        color: "var(--terminal-dim)",
        backgroundColor: "var(--terminal-surface)",
      }}
      {...props}
    >
      <div className="min-w-0 truncate">{left ?? children}</div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}
