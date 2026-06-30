'use client';

import type { ReactNode } from 'react';

import { Input, Message, TerminalLine, TerminalWindow } from '@/components/terminal-kit';

type InChatAuthTerminalProps = {
  /** Label shown in the window chrome header and footer. */
  path?: string;
  /** The user's opening request. */
  task: string;
  /** Toolkit the agent needs connected, display name, e.g. "Gmail". */
  toolkit: string;
  /** Lowercase toolkit slug used in tool args, e.g. "gmail". */
  toolkitSlug: string;
  /** The tool the agent executes once connected, e.g. "GMAIL_FETCH_EMAILS". */
  tool: string;
  /** Dim args shown on the executed tool call. */
  toolArgs?: string;
  /** Short result shown under the executed tool call, e.g. "12 emails". */
  toolResult?: string;
  /** The Connect Link the agent returns mid-conversation. */
  connectUrl?: string;
  /** The agent's final reply after the connection is established. */
  result: string;
};

/**
 * A Claude-Code-style tool call: a green bullet, the tool name (foreground), dim
 * `(args)`, and an optional `⎿ result` continuation line. Grouped in one session
 * row so the call and its result sit tight together.
 */
function ToolCall({
  name,
  args,
  result,
  resultTone = 'dim',
}: {
  name: string;
  args?: ReactNode;
  result?: ReactNode;
  resultTone?: 'dim' | 'success';
}) {
  return (
    <div className="terminal-session-inset text-[10px]">
      <TerminalLine className="text-[10px]">
        <span className="inline-flex min-w-0 items-baseline gap-2">
          <span className="shrink-0" style={{ color: 'var(--terminal-green)' }}>
            ⏺
          </span>
          <span className="min-w-0 truncate" style={{ color: 'var(--terminal-fg)' }}>
            {name}
          </span>
        </span>
      </TerminalLine>
      {result ? (
        <TerminalLine className="text-[10px]">
          <span className="inline-flex min-w-0 items-baseline gap-2">
            <span className="shrink-0" style={{ color: 'var(--terminal-vdim)' }}>
              ⎿
            </span>
            <span
              className="min-w-0 truncate"
              style={{
                color:
                  resultTone === 'success'
                    ? 'var(--terminal-green)'
                    : 'var(--terminal-dim)',
              }}
            >
              {result}
            </span>
          </span>
        </TerminalLine>
      ) : null}
    </div>
  );
}

/**
 * An agent message — same box shape as the user's `Message` bar, but outlined
 * with a border instead of a filled background so it reads as the agent, not the
 * tool plumbing. An optional `footer` (e.g. a link) renders inside, underneath.
 */
function AgentMessage({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div
      className="terminal-session-sent w-full border py-1.5 text-[11px]"
      style={{ borderColor: 'var(--terminal-border)', color: 'var(--terminal-fg)' }}
    >
      <span className="block min-w-0 whitespace-pre-wrap break-words">{children}</span>
      {footer ? <div className="mt-1">{footer}</div> : null}
    </div>
  );
}

/**
 * Renders an in-chat authentication exchange using terminal-kit (Claude palette,
 * adapts to the docs light/dark theme). The agent searches for a tool, hits a
 * missing connection, returns a Connect Link, then `COMPOSIO_WAIT_FOR_CONNECTIONS`
 * waits for the user to authenticate and the agent continues automatically — the
 * user never has to confirm in chat. Static transcript, no animation.
 */
export function InChatAuthTerminal({
  path = 'agent',
  task,
  toolkit,
  toolkitSlug,
  tool,
  toolArgs,
  toolResult,
  connectUrl = 'https://connect.composio.dev/link/ln_abc123',
  result,
}: InChatAuthTerminalProps) {
  return (
    <div className="not-prose mx-auto my-6 w-full max-w-[400px]">
      <TerminalWindow
        className="shadow-2xl"
        path={path}
        theme="claude"
        footer={<Input placeholder="Send a message…" showCursor />}
      >
        {/* Static transcript — rendered up front, no streaming/word animation.
            The pb-[50px] adds 50px below the transcript. */}
        <div className="terminal-session pb-[50px]">
          <Message>{task}</Message>

          <ToolCall
            name="COMPOSIO_MANAGE_CONNECTIONS"
            args={toolkitSlug}
            result={`${toolkit} not connected — sent Connect Link`}
          />

          <AgentMessage
            footer={
              <a
                href={connectUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: 'var(--terminal-teal)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 2,
                }}
              >
                {connectUrl}
              </a>
            }
          >
            {`Connect your ${toolkit} account to continue:`}
          </AgentMessage>

          <ToolCall
            name="COMPOSIO_WAIT_FOR_CONNECTIONS"
            args={toolkitSlug}
            result={`✓ ${toolkit} connected`}
            resultTone="success"
          />
          <ToolCall name={tool} args={toolArgs} result={toolResult} />

          <AgentMessage>{result}</AgentMessage>
        </div>
      </TerminalWindow>
    </div>
  );
}
