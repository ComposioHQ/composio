'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const LOGO_CDN = 'https://logos.composio.dev/api';

interface ChatSkin {
  name: string;
  subtitle?: string;
  logo?: string;
  invertLogo?: boolean;
  bg: string;
  userBubbleBg: string;
  inputBg: string;
  textColor: string;
  textMuted: string;
  borderColor: string;
  accent: string;
  modelLabel: string;
  radius: string;
}

type ChatItem =
  | { type: 'user'; content: string }
  | { type: 'tool'; name: string }
  | { type: 'assistant'; content: string };

type ActiveTool =
  | {
      kind: 'search';
      query: string;
      tools: { slug: string; name: string; description: string }[];
    }
  | {
      kind: 'execute';
      sessionId: string;
      tool: string;
      toolkitSlug: string;
      params: { key: string; value: string }[];
      status: string;
    }
  | {
      kind: 'workbench';
      task: string;
      code: string;
      result: string;
    };

interface Frame {
  /** Indices into `chatItems` to render. */
  items: number[];
  /** Index into `tools`; null hides the floating overlay. */
  toolIdx: number | null;
  /** Whether the thinking-dots indicator is showing. */
  thinking: boolean;
  /** ms before advancing to the next frame. */
  delay: number;
}

interface Example {
  skin: ChatSkin;
  chatItems: ChatItem[];
  tools: ActiveTool[];
  timeline: Frame[];
}

function findLastToolIdx(timeline: Frame[], currentIdx: number): number | null {
  for (let i = Math.min(currentIdx, timeline.length - 1); i >= 0; i--) {
    const t = timeline[i]?.toolIdx;
    if (t !== null && t !== undefined) return t;
  }
  return null;
}

const ACTIVE_TOOL_LABELS: Record<ActiveTool['kind'], string> = {
  search: 'COMPOSIO_SEARCH_TOOLS',
  execute: 'COMPOSIO_EXECUTE_TOOL',
  workbench: 'COMPOSIO_WORKBENCH',
};

const EXAMPLES: Example[] = [
  {
    skin: {
      name: 'Claude',
      subtitle: 'Cowork',
      logo: '/images/clients/claude.svg',
      bg: 'var(--hero-surface)',
      userBubbleBg: 'var(--hero-bubble)',
      inputBg: 'var(--hero-surface-2)',
      textColor: 'var(--hero-text)',
      textMuted: 'var(--hero-text-muted)',
      borderColor: 'var(--hero-border)',
      accent: '#c4956a',
      modelLabel: 'Sonnet 4.6',
      radius: '20px',
    },
    chatItems: [
      {
        type: 'user',
        content:
          'Summarize my Slack from the last 48 hours and send a digest to #daily-digest.',
      },
      { type: 'tool', name: 'COMPOSIO SEARCH TOOLS' },
      { type: 'tool', name: 'COMPOSIO WORKBENCH' },
      { type: 'tool', name: 'COMPOSIO EXECUTE TOOL' },
      {
        type: 'assistant',
        content:
          "Here's your 48-hour Slack digest. 3 critical items need your attention today.",
      },
    ],
    tools: [
      {
        kind: 'search',
        query: 'fetch slack messages and summarize',
        tools: [
          {
            slug: 'slack',
            name: 'SLACK_FETCH_MESSAGES',
            description: 'Fetch messages from a channel',
          },
          {
            slug: 'slack',
            name: 'SLACK_LIST_CHANNELS',
            description: 'List channels in a workspace',
          },
          {
            slug: 'slack',
            name: 'SLACK_SEND_MESSAGE',
            description: 'Post a message to a channel',
          },
        ],
      },
      {
        kind: 'workbench',
        task: 'Classify & summarize',
        code: `files = glob('/tmp/*.json')
all_msgs = []
for f in files:
  all_msgs += json.load(open(f))

ranked = invoke_llm(
  f'Classify {len(all_msgs)} messages'
  ' by urgency: P0, P1, P2'
)`,
        result: '3 critical, 12 important',
      },
      {
        kind: 'execute',
        sessionId: 'sx-7k2m',
        tool: 'SLACK_SEND_MESSAGE',
        toolkitSlug: 'slack',
        params: [
          { key: 'channel', value: '#daily-digest' },
          { key: 'text', value: 'summary (1,240 chars)' },
        ],
        status: '200 OK · message sent',
      },
    ],
    timeline: [
      { items: [0], toolIdx: null, thinking: false, delay: 900 },
      { items: [0], toolIdx: null, thinking: true, delay: 600 },
      { items: [0, 1], toolIdx: 0, thinking: false, delay: 2400 },
      { items: [0, 1, 2], toolIdx: 1, thinking: false, delay: 2800 },
      { items: [0, 1, 2, 3], toolIdx: 2, thinking: false, delay: 2200 },
      { items: [0, 1, 2, 3, 4], toolIdx: null, thinking: false, delay: 2400 },
    ],
  },
  {
    skin: {
      name: 'ChatGPT',
      subtitle: 'Codex',
      logo: '/images/clients/chatgpt.png',
      bg: 'var(--hero-surface)',
      userBubbleBg: 'var(--hero-bubble)',
      inputBg: 'var(--hero-surface-2)',
      textColor: 'var(--hero-text)',
      textMuted: 'var(--hero-text-muted)',
      borderColor: 'var(--hero-border)',
      accent: '#10a37f',
      modelLabel: 'GPT-4.1',
      radius: '14px',
    },
    chatItems: [
      {
        type: 'user',
        content:
          'Download all 250 SVGs from our Figma file and upload them to Google Drive.',
      },
      { type: 'tool', name: 'COMPOSIO SEARCH TOOLS' },
      { type: 'tool', name: 'COMPOSIO WORKBENCH' },
      {
        type: 'assistant',
        content:
          'Exported 250 SVGs from Figma and uploaded all files to Drive/assets/icons.',
      },
    ],
    tools: [
      {
        kind: 'search',
        query: 'export figma assets and upload to drive',
        tools: [
          {
            slug: 'figma',
            name: 'FIGMA_GET_FILE_NODES',
            description: 'Get nodes from a Figma file',
          },
          {
            slug: 'figma',
            name: 'FIGMA_EXPORT_ASSETS',
            description: 'Export assets as SVG/PNG',
          },
          {
            slug: 'googledrive',
            name: 'GOOGLEDRIVE_UPLOAD_FILE',
            description: 'Upload a file to Drive',
          },
        ],
      },
      {
        kind: 'workbench',
        task: 'Export Figma assets',
        code: `nodes = run_composio_tool(
  'FIGMA_GET_FILE_NODES',
  file_key=file_key,
)
svgs = []
for batch in chunks(nodes, 50):
  result = run_composio_tool(
    'FIGMA_EXPORT_ASSETS',
    ids=[n['id'] for n in batch],
  )`,
        result: '250 SVGs exported',
      },
    ],
    timeline: [
      { items: [0], toolIdx: null, thinking: false, delay: 900 },
      { items: [0], toolIdx: null, thinking: true, delay: 600 },
      { items: [0, 1], toolIdx: 0, thinking: false, delay: 2400 },
      { items: [0, 1, 2], toolIdx: 1, thinking: false, delay: 3000 },
      { items: [0, 1, 2, 3], toolIdx: null, thinking: false, delay: 2400 },
    ],
  },
  {
    skin: {
      name: 'Your AI Agent',
      bg: 'var(--hero-surface)',
      userBubbleBg: 'var(--hero-bubble)',
      inputBg: 'var(--hero-surface-2)',
      textColor: 'var(--hero-text)',
      textMuted: 'var(--hero-text-muted)',
      borderColor: 'rgba(0,7,205,0.22)',
      accent: '#0007cd',
      modelLabel: 'llama-3.3-70b',
      radius: '20px',
    },
    chatItems: [
      {
        type: 'user',
        content:
          'Triage all open Sentry errors and create Linear issues for P0s.',
      },
      { type: 'tool', name: 'COMPOSIO SEARCH TOOLS' },
      { type: 'tool', name: 'COMPOSIO EXECUTE TOOL' },
      {
        type: 'assistant',
        content:
          'Triaged 47 errors. 5 classified as P0 — created Linear issues LIN-482 → LIN-486.',
      },
    ],
    tools: [
      {
        kind: 'search',
        query: 'list sentry errors and create linear issues',
        tools: [
          {
            slug: 'sentry',
            name: 'SENTRY_LIST_ISSUES',
            description: 'List unresolved issues',
          },
          {
            slug: 'sentry',
            name: 'SENTRY_GET_EVENT',
            description: 'Get error event details',
          },
          {
            slug: 'linear',
            name: 'LINEAR_CREATE_ISSUE',
            description: 'Create a new Linear issue',
          },
        ],
      },
      {
        kind: 'execute',
        sessionId: 'sx-4r9b',
        tool: 'LINEAR_CREATE_ISSUE',
        toolkitSlug: 'linear',
        params: [
          { key: 'team', value: 'ENG' },
          { key: 'priority', value: 'P0 (urgent)' },
          { key: 'issues', value: 'LIN-482 → LIN-486' },
        ],
        status: '200 OK · 5 issues created',
      },
    ],
    timeline: [
      { items: [0], toolIdx: null, thinking: false, delay: 900 },
      { items: [0], toolIdx: null, thinking: true, delay: 600 },
      { items: [0, 1], toolIdx: 0, thinking: false, delay: 2400 },
      { items: [0, 1, 2], toolIdx: 1, thinking: false, delay: 2600 },
      { items: [0, 1, 2, 3], toolIdx: null, thinking: false, delay: 2400 },
    ],
  },
];

/**
 * v2 right-side mock chat — timeline-driven. Each example walks through
 * a step-by-step sequence: user prompt → thinking → tool trail items
 * appear one at a time → final assistant response. The floating tool
 * overlay is keyed to the current frame's `toolIdx` so it swaps content
 * (Search → Workbench → Execute) as the agent uses each one.
 *
 * The overlay is positioned outside the chat's left edge so it visually
 * sits in the middle of the page, half-overlapping the chat boundary.
 */
export function DocsHeroV2Chat() {
  const [exampleIdx, setExampleIdx] = useState(0);
  const [frameIdx, setFrameIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const example = EXAMPLES[exampleIdx]!;
    const timeline = example.timeline;
    if (frameIdx >= timeline.length) {
      // End of timeline — pause briefly, then advance to the next example.
      timerRef.current = setTimeout(() => {
        setExampleIdx((i) => (i + 1) % EXAMPLES.length);
        setFrameIdx(0);
      }, 1200);
    } else {
      const frame = timeline[frameIdx]!;
      timerRef.current = setTimeout(() => {
        setFrameIdx((f) => f + 1);
      }, frame.delay);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [exampleIdx, frameIdx]);

  const example = EXAMPLES[exampleIdx]!;
  const skin = example.skin;
  const frame =
    example.timeline[Math.min(frameIdx, example.timeline.length - 1)]!;
  const visibleItems = frame.items.map((i) => ({
    item: example.chatItems[i]!,
    id: `${exampleIdx}-${i}`,
  }));
  // Always show a tool overlay: fall back to the most recently lit
  // tool, or to the first tool of the example before anything fires.
  const shownToolIdx =
    frame.toolIdx ??
    findLastToolIdx(example.timeline, frameIdx) ??
    0;
  const activeTool = example.tools[shownToolIdx]!;

  return (
    <div className="relative h-full w-full">
      {/* Base chat panel — narrowed and pinned to the right so there's
          horizontal room between it and the tool overlay for the L-shape
          connector. */}
      <div
        className="absolute inset-y-0 right-0 flex w-full max-w-[340px] flex-col overflow-hidden border shadow-[0_1px_0_rgba(15,15,15,0.04)] transition-colors duration-300"
        style={{
          backgroundColor: skin.bg,
          borderColor: skin.borderColor,
          borderRadius: skin.radius,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-center gap-2 px-5 py-3">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={`hdr-${exampleIdx}`}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2"
              exit={{ opacity: 0, y: -6 }}
              initial={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.25 }}
            >
              {skin.logo ? (
                <img
                  alt=""
                  aria-hidden="true"
                  className={`h-4 w-4 object-contain ${skin.invertLogo ? 'invert' : ''}`}
                  draggable={false}
                  src={skin.logo}
                />
              ) : (
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: skin.accent }}
                />
              )}
              <span
                className="text-[13px] font-medium"
                style={{ color: skin.textColor }}
              >
                {skin.name}
                {skin.subtitle && (
                  <span
                    className="ml-1 font-normal"
                    style={{ color: skin.textMuted }}
                  >
                    {skin.subtitle}
                  </span>
                )}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Messages — items animate in one at a time */}
        <div className="flex flex-1 flex-col gap-3 overflow-hidden px-5 pt-1 pb-3">
          <AnimatePresence initial={false}>
            {visibleItems.map(({ item, id }, i) => {
              const isLatest = i === visibleItems.length - 1;
              return (
                <motion.div
                  key={id}
                  animate={{ opacity: isLatest ? 1 : 0.45, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  layout
                  transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                >
                  {renderChatItem(item, skin)}
                </motion.div>
              );
            })}
            {frame.thinking && (
              <motion.div
                key="thinking"
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                initial={{ opacity: 0, y: 6 }}
                layout
                transition={{ duration: 0.2 }}
              >
                <div className="flex gap-1">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="h-1.5 w-1.5 animate-[pulse-dot_1.4s_ease-in-out_infinite] rounded-full"
                      style={{
                        backgroundColor: skin.accent,
                        animationDelay: `${d * 0.18}s`,
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input bar */}
        <div className="px-3 pb-3">
          <div
            className="flex flex-col gap-2 px-4 pt-3 pb-2.5"
            style={{
              backgroundColor: skin.inputBg,
              borderRadius: `calc(${skin.radius} - 4px)`,
            }}
          >
            <span className="text-[14px]" style={{ color: skin.textMuted }}>
              Reply…
            </span>
            <div className="flex items-center justify-between">
              <svg
                fill="none"
                height="18"
                style={{ color: skin.textMuted }}
                viewBox="0 0 18 18"
                width="18"
              >
                <path
                  d="M9 1.5v15M1.5 9h15"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.5"
                />
              </svg>
              <div className="flex items-center gap-2.5">
                <span
                  className="text-[12px] leading-none"
                  style={{ color: skin.textMuted }}
                >
                  {skin.modelLabel}
                </span>
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full"
                  style={{ backgroundColor: skin.accent }}
                >
                  <svg
                    fill="none"
                    height="14"
                    viewBox="0 0 14 14"
                    width="14"
                  >
                    <path
                      d="M7 12V2M7 2L3 6M7 2l4 4"
                      stroke="white"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SVG connector — anchored against the chat's left edge. Goes
          horizontally left from the chat, then turns down into the top
          of the tool overlay.
          • Resting state: muted-grey path always visible.
          • Active pulse: brand-blue glow + line that "draw" on tool
            change and then fade back out, leaving only the grey line. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute z-[5] overflow-visible text-[var(--composio-brand)]"
        fill="none"
        preserveAspectRatio="none"
        style={{ right: '340px', top: '32%', width: '60px', height: '38%' }}
        viewBox="0 0 100 100"
      >
        {/* Inactive grey base line — always present */}
        <path
          d="M 100 0 H 0 V 100"
          stroke="var(--color-fd-foreground)"
          strokeLinecap="round"
          strokeOpacity="0.22"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {/* Pulse glow underlay — draws + fades on tool change */}
        <motion.path
          key={`glow-${exampleIdx}-${shownToolIdx}`}
          animate={{ pathLength: 1, opacity: [0, 0.2, 0.2, 0] }}
          d="M 100 0 H 0 V 100"
          initial={{ pathLength: 0, opacity: 0 }}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth={6}
          transition={{
            pathLength: { duration: 0.85, ease: [0.4, 0, 0.2, 1] },
            opacity: { duration: 1.4, times: [0, 0.2, 0.7, 1] },
          }}
          vectorEffect="non-scaling-stroke"
        />
        {/* Pulse bright line — draws + fades on tool change */}
        <motion.path
          key={`line-${exampleIdx}-${shownToolIdx}`}
          animate={{ pathLength: 1, opacity: [0, 1, 1, 0] }}
          d="M 100 0 H 0 V 100"
          initial={{ pathLength: 0, opacity: 0 }}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth={1.5}
          transition={{
            pathLength: { duration: 0.85, ease: [0.4, 0, 0.2, 1] },
            opacity: { duration: 1.4, times: [0, 0.2, 0.7, 1] },
          }}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Floating tool overlay — always rendered, anchored near the
          bottom of the chat, body content swaps with a fade/slide when
          `shownToolIdx` changes. */}
      <div className="pointer-events-none absolute bottom-6 left-0 z-10 flex max-h-[60%] -translate-x-[46%] flex-col">
        <div className="flex w-[320px] max-h-full flex-col overflow-hidden rounded-md border border-fd-border bg-fd-card font-mono shadow-[0_24px_48px_-18px_rgba(15,15,15,0.32)]">
          <ActiveToolHeader label={ACTIVE_TOOL_LABELS[activeTool.kind]} />
          <div
            className="flex-1 overflow-hidden"
            style={{
              maskImage:
                'linear-gradient(to bottom, black 0%, black 80%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to bottom, black 0%, black 80%, transparent 100%)',
            }}
          >
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={`tool-${exampleIdx}-${shownToolIdx}`}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                initial={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              >
                <ActiveToolBody tool={activeTool} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderChatItem(item: ChatItem, skin: ChatSkin) {
  if (item.type === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] px-4 py-2.5 text-[14px] leading-relaxed"
          style={{
            backgroundColor: skin.userBubbleBg,
            color: skin.textColor,
            borderRadius: `calc(${skin.radius} - 4px)`,
          }}
        >
          {item.content}
        </div>
      </div>
    );
  }
  if (item.type === 'tool') {
    return (
      <div className="inline-flex items-center gap-1 text-[12px] uppercase tracking-wider hero-tool-shimmer">
        <span className="font-medium">{item.name}</span>
        <svg
          aria-hidden="true"
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 12 12"
        >
          <path
            d="M4 3l3 3-3 3"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </div>
    );
  }
  return (
    <p
      className="text-[15px] leading-relaxed"
      style={{ color: skin.textColor }}
    >
      {item.content}
    </p>
  );
}

function ActiveToolHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between border-b border-fd-border px-3 py-1.5 text-[10px]">
      <span className="uppercase tracking-[0.04em] text-fd-foreground/45">
        {label}
      </span>
      <span className="inline-flex items-center gap-1 text-[var(--composio-brand)]">
        <span className="relative inline-flex">
          <span className="size-1.5 rounded-full bg-[var(--composio-brand)]" />
          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--composio-brand)] opacity-60" />
        </span>
        <span className="uppercase tracking-[0.04em]">running</span>
      </span>
    </div>
  );
}

function ActiveToolBody({ tool }: { tool: ActiveTool }) {
  if (tool.kind === 'search') return <SearchToolBody tool={tool} />;
  if (tool.kind === 'execute') return <ExecuteToolBody tool={tool} />;
  return <WorkbenchToolBody tool={tool} />;
}

function SearchToolBody({
  tool,
}: {
  tool: Extract<ActiveTool, { kind: 'search' }>;
}) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center gap-2 border border-fd-border bg-fd-background px-2 py-1">
        <svg
          aria-hidden="true"
          className="size-3 text-fd-foreground/40"
          fill="none"
          viewBox="0 0 12 12"
        >
          <circle
            cx="5.25"
            cy="5.25"
            r="3.75"
            stroke="currentColor"
            strokeWidth="1"
          />
          <path
            d="M8 8l2.5 2.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1"
          />
        </svg>
        <span className="truncate text-[10.5px] text-fd-foreground/65">
          {tool.query}
        </span>
        <span className="ml-auto shrink-0 text-[10px] text-fd-foreground/35">
          {tool.tools.length} found
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {tool.tools.slice(0, 3).map((t) => (
          <div
            key={t.name}
            className="flex items-center gap-2 border border-fd-border bg-fd-background px-2 py-1.5"
          >
            <img
              alt=""
              aria-hidden="true"
              className="size-3.5 object-contain"
              draggable={false}
              src={`${LOGO_CDN}/${t.slug}`}
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[10.5px] text-fd-foreground/75">
                {t.name}
              </span>
              <span className="truncate text-[9.5px] text-fd-foreground/45">
                {t.description}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExecuteToolBody({
  tool,
}: {
  tool: Extract<ActiveTool, { kind: 'execute' }>;
}) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5">
      <div className="text-[10px] text-fd-foreground/40">
        SESSION: {tool.sessionId}
      </div>
      <div className="flex items-center gap-2 border border-fd-border bg-fd-background px-2 py-1.5">
        <img
          alt=""
          aria-hidden="true"
          className="size-3.5 object-contain"
          draggable={false}
          src={`${LOGO_CDN}/${tool.toolkitSlug}`}
        />
        <span className="truncate text-[10.5px] text-fd-foreground/75">
          {tool.tool}
        </span>
      </div>
      <div className="flex flex-col gap-1 border border-fd-border bg-fd-background px-2 py-1.5">
        {tool.params.map((p) => (
          <div
            key={p.key}
            className="flex items-center justify-between text-[10px]"
          >
            <span className="text-fd-foreground/45">{p.key}</span>
            <span className="text-fd-foreground/75">{p.value}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--composio-brand)]">
        <svg
          aria-hidden="true"
          className="size-3"
          fill="none"
          viewBox="0 0 12 12"
        >
          <path
            d="M2.5 6l2.5 2.5L9.5 3.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
        <span>{tool.status}</span>
      </div>
    </div>
  );
}

function WorkbenchToolBody({
  tool,
}: {
  tool: Extract<ActiveTool, { kind: 'workbench' }>;
}) {
  return (
    <div className="flex flex-col bg-fd-muted">
      <div className="flex items-center justify-between gap-2 border-b border-fd-border px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <CpuLightsStatic />
          <span className="truncate text-[9.5px] uppercase tracking-wider text-fd-foreground/55">
            {tool.task}
          </span>
        </div>
        <span className="shrink-0 text-[9px] uppercase tracking-wider text-[var(--composio-brand)]">
          {tool.result ? 'done' : 'running'}
        </span>
      </div>
      <div
        className="relative overflow-hidden px-3 py-2"
        style={{
          maskImage:
            'linear-gradient(to bottom, black 0%, black 70%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, black 0%, black 70%, transparent 100%)',
        }}
      >
        <pre className="overflow-hidden text-[10px] leading-[1.55] text-fd-foreground/65">
          {tool.code}
        </pre>
      </div>
    </div>
  );
}

function CpuLightsStatic() {
  const cells = Array.from({ length: 8 });
  return (
    <div
      className="grid shrink-0 gap-[1px]"
      style={{
        gridTemplateColumns: 'repeat(4, 4px)',
        gridTemplateRows: 'repeat(2, 4px)',
      }}
    >
      {cells.map((_, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const delay = (col * 120 + row * 60) % 720;
        return (
          <span
            key={i}
            className="bg-[var(--composio-brand)]"
            style={{
              animation: `hero-cpu-pulse 1.4s ease-in-out ${delay}ms infinite`,
            }}
          />
        );
      })}
    </div>
  );
}
