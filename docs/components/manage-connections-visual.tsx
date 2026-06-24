"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Message } from "@/components/terminal-kit/session/message";
import { TerminalWindow } from "@/components/terminal-kit/shell/terminal-window";
import { ThinkingIndicator } from "@/components/terminal-kit/ui/thinking-indicator";
import { cn } from "@/lib/utils";

const LOGO_CDN = "https://logos.composio.dev/api";

/**
 * Claude (dark) terminal-kit palette, pinned inline so the terminal renders dark
 * regardless of the docs light/dark theme (the rest of the composition — Google
 * auth window, connections panel — uses hardcoded colors too). Mirrors landing's
 * `.tk-claude-dark` override. `--font-geist-mono` is left to the `.terminal-theme`
 * default so docs JetBrains Mono is used.
 */
const DARK_VARS = {
	"--terminal-bg": "#0b0b0b",
	"--terminal-editor-bg": "#1f1f1e",
	"--terminal-fg": "#ffffff",
	"--terminal-white": "#ffffff",
	"--terminal-dim": "#c3c2b7",
	"--terminal-dimmer": "#898781",
	"--terminal-vdim": "#3d3d3d",
	"--terminal-surface": "#232323",
	"--terminal-input-bg": "#1f1f1e",
	"--terminal-popover": "#2a2a2a",
	"--terminal-panel": "rgba(255, 255, 255, 0.05)",
	"--terminal-panel-strong": "rgba(255, 255, 255, 0.07)",
	"--terminal-border": "rgba(255, 255, 255, 0.1)",
	"--terminal-input-border": "#565552",
	"--terminal-progress-track": "#3d3d3d",
	"--terminal-progress-fill": "#d97757",
	"--terminal-green": "#4cc38a",
	"--terminal-blue": "#4d9fff",
	"--terminal-teal": "#d97757",
	"--terminal-red": "#ff5a5a",
	"--terminal-purple": "#9775fa",
	"--terminal-traffic-red": "#ff5f57",
	"--terminal-traffic-yellow": "#febc2e",
	"--terminal-traffic-green": "#28c840",
} as React.CSSProperties;

type Pt = { x: number; y: number };

/** L-elbow: run horizontal from p, then drop vertically into q. */
function elbowHV(p: Pt, q: Pt, r = 10): string {
	const sx = Math.sign(q.x - p.x) || 1;
	const sy = Math.sign(q.y - p.y) || 1;
	const rr = Math.min(r, Math.abs(q.x - p.x), Math.abs(q.y - p.y));
	if (rr < 1) return `M ${p.x} ${p.y} L ${q.x} ${q.y}`;
	return `M ${p.x} ${p.y} L ${q.x - sx * rr} ${p.y} Q ${q.x} ${p.y} ${q.x} ${
		p.y + sy * rr
	} L ${q.x} ${q.y}`;
}

/** L-elbow: drop vertically from p, then run horizontal into q. */
function elbowVH(p: Pt, q: Pt, r = 10): string {
	const sx = Math.sign(q.x - p.x) || 1;
	const sy = Math.sign(q.y - p.y) || 1;
	const rr = Math.min(r, Math.abs(q.x - p.x), Math.abs(q.y - p.y));
	if (rr < 1) return `M ${p.x} ${p.y} L ${q.x} ${q.y}`;
	return `M ${p.x} ${p.y} L ${p.x} ${q.y - sy * rr} Q ${p.x} ${q.y} ${
		p.x + sx * rr
	} ${q.y} L ${q.x} ${q.y}`;
}

type Phase = "intent" | "authorizing" | "active";

type Row = {
	id: string;
	app: string;
	name: string;
	account: string;
	alias: string | null;
	/** The account being connected in this run (animates in). */
	dynamic?: boolean;
};

const SCENARIO = {
	intent:
		"send the report from our work Gmail, then a copy to me from my personal account",
	connect: {
		app: "gmail",
		appName: "Gmail",
		account: "alex@gmail.com",
		alias: "personal",
	},
	rows: [
		{
			id: "gmail-personal",
			app: "gmail",
			name: "Gmail",
			account: "alex@gmail.com",
			alias: "personal",
			dynamic: true,
		},
		{
			id: "gmail-work",
			app: "gmail",
			name: "Gmail",
			account: "ops@acme.com",
			alias: "work",
		},
	] as Row[],
} as const;

const REPLY_OPEN =
	'Gmail "personal" isn\'t connected. Opening the authorization page in your browser.';
const REPLY_DONE =
	"Connected. Sending the report from work, then a copy to you from personal.";

/** Bordered card (Neon style), animates in. */
function FloatingCard({
	className,
	style,
	innerRef,
	show,
	delay = 0,
	bare = false,
	neutral = false,
	boxMotion = false,
	children,
}: {
	className?: string;
	style?: React.CSSProperties;
	innerRef?: React.Ref<HTMLDivElement>;
	show: boolean;
	delay?: number;
	bare?: boolean;
	/** Use a neutral border instead of the blue accent. */
	neutral?: boolean;
	/** Animate the box's height (and let its content cross-fade) on change. */
	boxMotion?: boolean;
	children: React.ReactNode;
}) {
	// Always present; opacity-only so the layout box (and the connectors anchored
	// to it) never shift. Sits faded until active, and fades back on replay.
	return (
		<motion.div
			animate={{ opacity: show ? 1 : 0.3 }}
			className={cn("absolute", className)}
			initial={false}
			style={style}
			transition={{
				duration: 0.55,
				delay: show ? delay : 0,
				ease: [0.22, 1, 0.36, 1],
			}}
		>
			<motion.div
				className={cn(
					"overflow-hidden shadow-[0_24px_70px_-10px_rgba(0,0,0,0.7)]",
					bare
						? "rounded-lg"
						: neutral
							? "border border-white/10 bg-[#0c0c0d]"
							: "border border-[#51a2ff]/55 bg-[#0c0c0d]",
				)}
				layout={boxMotion ? true : undefined}
				ref={innerRef}
				style={bare ? { borderRadius: "0.5rem" } : undefined}
				transition={
					boxMotion
						? { layout: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }
						: undefined
				}
			>
				{children}
			</motion.div>
		</motion.div>
	);
}

const APP_NAME = "Acme Assistant";
const G_ACCOUNTS = [
	{ name: "Alex Rivera", email: "ops@acme.com", color: "#1a73e8" },
	{
		name: "Alex Rivera",
		email: "alex@gmail.com",
		color: "#188038",
		target: true,
	},
	{ name: "Alex Rivera", email: "a.rivera@contoso.com", color: "#9334e6" },
];

/** Google "G" mark for the sign-in mock. */
function GoogleG({ className }: { className?: string }) {
	return (
		<svg aria-hidden="true" className={className} viewBox="0 0 48 48">
			<path
				d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
				fill="#EA4335"
			/>
			<path
				d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
				fill="#4285F4"
			/>
			<path
				d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
				fill="#FBBC05"
			/>
			<path
				d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
				fill="#34A853"
			/>
		</svg>
	);
}

/** "Sign in with Google" browser window mock (the OAuth account chooser). */
function GoogleAuthWindow({ phase }: { phase: Phase }) {
	const selecting = phase === "authorizing";
	const done = phase === "active";
	return (
		<div className="w-full overflow-hidden rounded-lg bg-white text-black">
			{/* browser chrome */}
			<div className="flex items-center gap-2 bg-[#dfe1e5] px-3 py-1.5">
				<div className="flex gap-1.5">
					<span className="size-2.5 rounded-full bg-[#ff5f57]" />
					<span className="size-2.5 rounded-full bg-[#febc2e]" />
					<span className="size-2.5 rounded-full bg-[#28c840]" />
				</div>
				<div className="ml-1 flex flex-1 items-center gap-1.5 rounded-md bg-white px-2 py-0.5 text-[10px] text-black/55">
					<svg
						aria-hidden="true"
						className="size-2.5 shrink-0"
						fill="none"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						viewBox="0 0 24 24"
					>
						<rect height="11" rx="2" width="18" x="3" y="11" />
						<path d="M7 11V7a5 5 0 0 1 10 0v4" />
					</svg>
					<span className="truncate">accounts.google.com</span>
				</div>
			</div>
			{/* google header */}
			<div className="flex items-center gap-2 border-black/10 border-b px-4 py-2.5">
				<GoogleG className="size-4" />
				<span className="text-[12px] text-black/70">Sign in with Google</span>
			</div>
			{/* body */}
			<div className="px-4 pt-3 pb-3">
				<div className="text-center text-[15px] text-black/85">
					Choose an account
				</div>
				<div className="mt-0.5 text-center text-[11px] text-black/55">
					to continue to <span className="text-[#1a73e8]">{APP_NAME}</span>
				</div>
				<div className="mt-3 flex flex-col gap-0.5">
					{G_ACCOUNTS.map((a) => {
						const active = a.target && (selecting || done);
						return (
							<div
								className={cn(
									"flex items-center gap-3 rounded-md px-2 py-2",
									active && "bg-[#e8f0fe]",
								)}
								key={a.email}
							>
								<span
									className="flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] text-white"
									style={{ background: a.color }}
								>
									{a.name[0]}
								</span>
								<div className="min-w-0 flex-1">
									<div className="truncate text-[12px] text-black/85 leading-tight">
										{a.name}
									</div>
									<div className="truncate text-[11px] text-black/50 leading-tight">
										{a.email}
									</div>
								</div>
								{a.target && selecting && (
									<span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-black/15 border-t-[#1a73e8]" />
								)}
								{a.target && done && (
									<svg
										aria-hidden="true"
										className="size-4 shrink-0 text-[#188038]"
										fill="none"
										stroke="currentColor"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2.5}
										viewBox="0 0 24 24"
									>
										<path d="M5 13l4 4L19 7" />
									</svg>
								)}
							</div>
						);
					})}
				</div>
				<div className="mt-2 border-black/10 border-t pt-2 text-[10px] text-black/45 leading-relaxed">
					To continue, Google will share your name, email address, and profile
					picture with {APP_NAME}.
				</div>
			</div>
		</div>
	);
}

/** Dark-mode skeleton placeholder shown before the auth flow starts. */
function GoogleAuthSkeleton() {
	return (
		<div className="w-full animate-pulse rounded-lg border border-white/[0.1] bg-white/[0.05] p-5">
			<div className="mx-auto h-3 w-32 rounded bg-white/[0.1]" />
			<div className="mx-auto mt-2.5 h-2 w-44 rounded bg-white/[0.06]" />
			<div className="mt-7 flex flex-col gap-5">
				{[0, 1, 2].map((i) => (
					<div className="flex items-center gap-3" key={i}>
						<span className="size-9 shrink-0 rounded-full bg-white/[0.08]" />
						<div className="flex-1">
							<div className="h-2.5 w-28 rounded bg-white/[0.1]" />
							<div className="mt-2 h-2 w-36 rounded bg-white/[0.06]" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ── Right panel: Neon-style auth composition ────────────────────────────
function ConnectionsComposition({
	phase,
	step,
	showConnections,
	authorizeRef,
	connectionsRef,
}: {
	phase: Phase;
	step: number;
	showConnections: boolean;
	authorizeRef: React.Ref<HTMLDivElement>;
	connectionsRef: React.Ref<HTMLDivElement>;
}) {
	// The auth panel only resolves once the connector from the terminal has
	// arrived (step 4); until then it sits as a faded skeleton.
	const authReady = step >= 3;
	const visibleRows = SCENARIO.rows.filter(
		(r) => !r.dynamic || phase !== "intent",
	);

	return (
		<div className="relative h-full w-full overflow-hidden">
			{/* connections card */}
			<FloatingCard
				className="left-0 bottom-0 w-[24rem]"
				delay={0.2}
				innerRef={connectionsRef}
				neutral
				show={showConnections}
			>
				<div className="font-mono">
					<div className="flex items-center gap-2 border-white/[0.06] border-b bg-white/[0.02] px-3 py-2">
						<svg
							aria-hidden="true"
							className="size-3 shrink-0 text-white/35"
							fill="none"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							viewBox="0 0 24 24"
						>
							<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
							<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
						</svg>
						<span className="text-[11px] text-white/35 uppercase tracking-wider">
							active connections
						</span>
					</div>
					<div className="px-3 py-1.5">
						<AnimatePresence initial={false}>
							{visibleRows.map((row) => {
								const pending = row.dynamic && phase === "authorizing";
								const added = row.dynamic && phase === "active";
								return (
									<motion.div
										animate={{ opacity: 1, height: "auto" }}
										exit={{ opacity: 0, height: 0 }}
										initial={row.dynamic ? { opacity: 0, height: 0 } : false}
										key={row.id}
										transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
									>
										<div
											className={cn(
												"relative overflow-hidden rounded-md",
												added &&
													"-mx-1.5 bg-[#51a2ff]/[0.07] px-1.5",
											)}
										>
											{added && (
												<motion.span
													animate={{ x: ["-130%", "330%"] }}
													aria-hidden="true"
													className="pointer-events-none absolute inset-y-0 left-0 w-1/3"
													style={{
														background:
															"linear-gradient(90deg, transparent, #51a2ff, transparent)",
														opacity: 0.4,
													}}
													transition={{
														duration: 1.6,
														ease: "easeInOut",
														repeat: Number.POSITIVE_INFINITY,
														repeatDelay: 0.7,
													}}
												/>
											)}
											<div className="relative z-10 flex items-center gap-2.5 py-1">
												<img
													alt={row.name}
													aria-hidden="true"
													className="h-[15px] w-[15px] shrink-0 object-contain"
													draggable={false}
													src={`${LOGO_CDN}/${row.app}`}
												/>
												<span className="min-w-0 flex-1 truncate text-[11px] text-white/65">
													{row.account}
												</span>
												{row.alias && (
													<span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-white/55 uppercase tracking-wider">
														{row.alias}
													</span>
												)}
												{pending ? (
													<span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
												) : (
													<svg
														aria-label="connected"
														className="size-4 shrink-0 text-green-400"
														fill="none"
														role="img"
														stroke="currentColor"
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2.5}
														viewBox="0 0 24 24"
													>
														<path d="M5 13l4 4L19 7" />
													</svg>
												)}
											</div>
										</div>
									</motion.div>
								);
							})}
						</AnimatePresence>
					</div>
				</div>
			</FloatingCard>

			{/* authorize card — Sign in with Google browser window, centered
			    between the terminal and the connections panel */}
			<FloatingCard
				bare
				boxMotion
				className="top-[104px] right-0 w-[300px]"
				delay={0.1}
				innerRef={authorizeRef}
				show={authReady}
			>
				<AnimatePresence initial={false} mode="popLayout">
					{authReady ? (
						<motion.div
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							initial={{ opacity: 0 }}
							key="window"
							transition={{ duration: 0.3 }}
						>
							<GoogleAuthWindow phase={phase} />
						</motion.div>
					) : (
						<motion.div
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							initial={{ opacity: 0 }}
							key="skeleton"
							transition={{ duration: 0.3 }}
						>
							<GoogleAuthSkeleton />
						</motion.div>
					)}
				</AnimatePresence>
			</FloatingCard>
		</div>
	);
}

/** Streams text in word-by-word (terminal-kit StreamText style). */
function StreamText({
	text,
	play,
	speed = 80,
}: {
	text: string;
	play: boolean;
	speed?: number;
}) {
	const words = text.split(" ");
	const [n, setN] = useState(play ? 0 : words.length);
	useEffect(() => {
		if (!play) {
			setN(words.length);
			return;
		}
		setN(0);
		let i = 0;
		const id = setInterval(() => {
			i += 1;
			setN(i);
			if (i >= words.length) clearInterval(id);
		}, speed);
		return () => clearInterval(id);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [text, play, speed]);
	return <span>{words.slice(0, n).join(" ")}</span>;
}

/** Agent tool call — `⏺ NAME(args)` + optional `⎿ result`, matching the in-chat terminal. */
function ToolCall({
	name,
	args,
	result,
	resultTone = "dim",
}: {
	name: string;
	args?: React.ReactNode;
	result?: React.ReactNode;
	resultTone?: "dim" | "success";
}) {
	return (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			initial={{ opacity: 0, y: 4 }}
			transition={{ duration: 0.25 }}
		>
			<div className="flex min-w-0 items-baseline gap-2 text-[11px]">
				<span className="shrink-0" style={{ color: "var(--terminal-green)" }}>
					⏺
				</span>
				<span
					className="min-w-0 truncate"
					style={{ color: "var(--terminal-fg)" }}
				>
					{name}
				</span>
			</div>
			{result ? (
				<div className="flex min-w-0 items-baseline gap-2 text-[11px]">
					<span className="shrink-0" style={{ color: "var(--terminal-vdim)" }}>
						⎿
					</span>
					<span
						className="min-w-0 truncate"
						style={{
							color:
								resultTone === "success"
									? "var(--terminal-green)"
									: "var(--terminal-dim)",
						}}
					>
						{result}
					</span>
				</div>
			) : null}
		</motion.div>
	);
}

/** Agent message — bordered box (outlined, no fill), matching the in-chat terminal. */
function AgentMessage({
	children,
	footer,
}: {
	children: React.ReactNode;
	footer?: React.ReactNode;
}) {
	return (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			className="terminal-session-sent w-full border py-1.5 text-[11px]"
			initial={{ opacity: 0, y: 4 }}
			style={{ borderColor: "var(--terminal-border)", color: "var(--terminal-fg)" }}
			transition={{ duration: 0.25 }}
		>
			<span className="block min-w-0 whitespace-pre-wrap break-words">
				{children}
			</span>
			{footer ? <div className="mt-1">{footer}</div> : null}
		</motion.div>
	);
}

/** Assistant reply line in the transcript. */
function AssistantLine({ children }: { children: React.ReactNode }) {
	return (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			className="px-1 text-[11px] text-[var(--terminal-fg)]/75 leading-relaxed"
			initial={{ opacity: 0, y: 4 }}
			transition={{ duration: 0.3 }}
		>
			{children}
		</motion.div>
	);
}

/** A "opened in the browser" action row referencing the auth page. */
function BrowserLine({
	url,
	state,
	lineRef,
	pulse,
}: {
	url: string;
	state: string;
	lineRef?: React.Ref<HTMLDivElement>;
	pulse?: boolean;
}) {
	return (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			className="relative flex items-center gap-2 overflow-hidden border border-[var(--terminal-border)] bg-[var(--terminal-editor-bg)] px-2 py-1.5 text-[11px]"
			initial={{ opacity: 0, y: 4 }}
			ref={lineRef}
			transition={{ duration: 0.25, delay: 0.1 }}
		>
			{/* blue pulse sweeps left→right before the connector draws */}
			{pulse && (
				<motion.span
					animate={{ x: ["-100%", "300%"] }}
					className="pointer-events-none absolute inset-y-0 left-0 w-1/3"
					initial={{ x: "-100%" }}
					style={{
						background:
							"linear-gradient(90deg, transparent, #51a2ff, transparent)",
						opacity: 0.5,
					}}
					transition={{ duration: 0.8, ease: "easeInOut" }}
				/>
			)}
			<svg
				aria-hidden="true"
				className="size-3.5 shrink-0 text-[var(--terminal-fg)]/50"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.75}
				viewBox="0 0 24 24"
			>
				<circle cx="12" cy="12" r="9" />
				<path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
			</svg>
			<span className="truncate text-[var(--terminal-fg)]/80">{url}</span>
			<span className="ml-auto shrink-0 text-[var(--terminal-fg)]/45">
				{state}
			</span>
		</motion.div>
	);
}

export function ManageConnectionsVisual() {
	const rootRef = useRef<HTMLDivElement>(null);
	const terminalRef = useRef<HTMLDivElement>(null);
	const browserRef = useRef<HTMLDivElement>(null);
	const authorizeRef = useRef<HTMLDivElement>(null);
	const connectionsRef = useRef<HTMLDivElement>(null);
	const [inView, setInView] = useState(false);
	const [runId, setRunId] = useState(0);
	// step: 0 idle · 1 task shown · 2 reply · 3 opening auth · 4 waiting · 5 connected
	const [step, setStep] = useState(0);
	const [link, setLink] = useState<{
		p1: string;
		p1End: Pt;
		p2: string;
		p2End: Pt;
	} | null>(null);

	const scenario = SCENARIO;
	const phase: Phase =
		step <= 2 ? "intent" : step >= 5 ? "active" : "authorizing";
	const working = phase !== "intent";

	const calc = useCallback(() => {
		const root = rootRef.current;
		const t = terminalRef.current;
		const a = authorizeRef.current;
		const c = connectionsRef.current;
		if (!root || !t || !a || !c) return;
		const cr = root.getBoundingClientRect();
		const rel = (r: DOMRect) => ({
			left: r.left - cr.left,
			right: r.right - cr.left,
			top: r.top - cr.top,
			bottom: r.bottom - cr.top,
			midX: r.left + r.width / 2 - cr.left,
			midY: r.top + r.height / 2 - cr.top,
		});
		const tr = rel(t.getBoundingClientRect());
		const ar = rel(a.getBoundingClientRect());
		const cc = rel(c.getBoundingClientRect());
		// terminal (top) drops down into the auth card; auth → connections is a
		// horizontal hop across the row below.
		// terminal header's left border → top of authorize
		const p1End: Pt = { x: ar.midX, y: ar.top };
		// bottom of authorize → left of connections. Drop the same vertical
		// distance as the top connector before entering the left edge, so both
		// connectors travel equally in Y (clamped inside the connections box).
		const topDrop = ar.top - (tr.top + 22);
		const p2End: Pt = {
			x: cc.right,
			y: Math.min(cc.bottom - 16, Math.max(cc.top + 16, ar.bottom + topDrop)),
		};
		setLink({
			p1: elbowHV({ x: tr.right, y: tr.top + 22 }, p1End),
			p1End,
			p2: elbowVH({ x: ar.midX, y: ar.bottom }, p2End),
			p2End,
		});
	}, []);

	useEffect(() => {
		const el = rootRef.current;
		if (!el) return;
		const io = new IntersectionObserver(
			([e]) => e?.isIntersecting && setInView(true),
			{ threshold: 0.3 },
		);
		io.observe(el);
		return () => io.disconnect();
	}, []);

	useEffect(() => {
		calc();
		const t = setTimeout(calc, 120);
		window.addEventListener("resize", calc);
		// Recompute whenever a panel resizes/reflows so the connectors keep up.
		const els = [
			rootRef.current,
			terminalRef.current,
			authorizeRef.current,
			connectionsRef.current,
		].filter((el): el is HTMLDivElement => el != null);
		const ro = new ResizeObserver(() => calc());
		for (const el of els) ro.observe(el);
		return () => {
			clearTimeout(t);
			window.removeEventListener("resize", calc);
			ro.disconnect();
		};
	}, [calc]);

	// After each step change the panels resize/reflow (e.g. the auth box morphs
	// from skeleton to window). Re-measure every frame for ~0.7s so the
	// connectors follow the animating panel smoothly instead of glitching.
	useEffect(() => {
		let raf = 0;
		let start: number | null = null;
		const tick = (now: number) => {
			if (start == null) start = now;
			calc();
			if (now - start < 700) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [step, calc]);

	// Step machine: the user message animates in right away (no typing), then the
	// transcript advances one message at a time.
	useEffect(() => {
		if (!inView) return;
		setStep(0);
		const ts = [
			setTimeout(() => setStep(1), 300),
			setTimeout(() => setStep(2), 1100),
			setTimeout(() => setStep(3), 2000),
			setTimeout(() => setStep(4), 2900),
			setTimeout(() => setStep(5), 3900),
		];
		return () => ts.forEach(clearTimeout);
	}, [inView, runId]);

	const replay = () => setRunId((r) => r + 1);

	return (
		<div
			className="not-prose relative flex w-full flex-col gap-6 py-8 md:mr-auto md:block md:h-[550px] md:max-w-[760px] md:py-0"
			ref={rootRef}
			style={{ "--brand": "#51a2ff" } as React.CSSProperties}
		>
			{/* ── Connector overlay ── */}
			<svg
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 z-0 hidden size-full overflow-visible text-[#51a2ff] md:block"
				fill="none"
			>
				<style>{`
					@keyframes mcDraw { to { stroke-dashoffset: 0; } }
					@media (prefers-reduced-motion: reduce) {
						.mc-draw { animation: none !important; stroke-dashoffset: 0; }
					}
				`}</style>
				{link && (
					<>
						{/* terminal → authorize */}
						{working && (
							<g key={`p1-${runId}`}>
								<path
									d={link.p1}
									opacity={0.1}
									stroke="currentColor"
									strokeWidth={1}
								/>
								<path
									className="mc-draw"
									d={link.p1}
									stroke="currentColor"
									strokeDasharray="800"
									strokeDashoffset="800"
									strokeWidth={1.5}
									style={{ animation: "mcDraw 0.4s ease-out 0.15s forwards" }}
								/>
								<circle
									cx={link.p1End.x}
									cy={link.p1End.y}
									fill="currentColor"
									opacity={0}
									r={2.5}
								>
									<animate
										attributeName="opacity"
										begin="0.5s"
										dur="0.2s"
										fill="freeze"
										from="0"
										to="0.45"
									/>
								</circle>
							</g>
						)}
						{/* authorize → connections */}
						{step >= 4 && (
							<g key={`p2-${runId}`}>
								<path
									d={link.p2}
									opacity={0.1}
									stroke="currentColor"
									strokeWidth={1}
								/>
								<path
									className="mc-draw"
									d={link.p2}
									stroke="currentColor"
									strokeDasharray="800"
									strokeDashoffset="800"
									strokeWidth={1.5}
									style={{ animation: "mcDraw 0.4s ease-out 0.05s forwards" }}
								/>
								<circle
									cx={link.p2End.x}
									cy={link.p2End.y}
									fill="currentColor"
									opacity={0}
									r={2.5}
								>
									<animate
										attributeName="opacity"
										begin="0.3s"
										dur="0.2s"
										fill="freeze"
										from="0"
										to="0.45"
									/>
								</circle>
							</g>
						)}
					</>
				)}
			</svg>

			{/* ── Terminal (same size as the search row) ── */}
			<div className="relative z-10 w-full max-w-md md:absolute md:top-0 md:left-0 md:w-[24rem] md:max-w-none">
				<div className="md:h-[350px]" ref={terminalRef}>
					<div className="h-full w-full">
						<TerminalWindow
							className="h-full"
							style={DARK_VARS}
							fill
							path="~/projects/composio"
							theme="claude"
							variant="dark"
						>
							<div className="flex flex-col gap-2.5">
								{step >= 1 && (
									<motion.div
										animate={{ opacity: 1, y: 0 }}
										initial={{ opacity: 0, y: 4 }}
										transition={{ duration: 0.25 }}
									>
										<Message>{scenario.intent}</Message>
									</motion.div>
								)}
								{step >= 2 && (
									<ToolCall
										name="COMPOSIO_MANAGE_CONNECTIONS"
										result="not connected — sent Connect Link"
									/>
								)}
								{step >= 3 && (
									<AgentMessage
										footer={
											<a
												href="https://auth.composio.dev/connect/gmail?as=personal"
												target="_blank"
												rel="noreferrer"
												className="block min-w-0 truncate underline"
												style={{
													color: "var(--terminal-teal)",
													textUnderlineOffset: 2,
												}}
											>
												auth.composio.dev/connect/gmail?as=personal
											</a>
										}
									>
										Connect your personal Gmail to continue:
									</AgentMessage>
								)}
								{step >= 4 && (
									<ToolCall
										name="COMPOSIO_WAIT_FOR_CONNECTIONS"
										result={
											step >= 5
												? "✓ personal connected"
												: "waiting for authorization…"
										}
										resultTone={step >= 5 ? "success" : "dim"}
									/>
								)}
								{step >= 5 && (
									<ToolCall
										name="GMAIL_SEND_EMAIL"
										result="sent"
										resultTone="success"
									/>
								)}
							</div>
						</TerminalWindow>
					</div>
				</div>
				<motion.button
					animate={{ opacity: phase === "active" ? 1 : 0 }}
					className="mt-3 flex items-center gap-1.5 font-mono text-[12px] text-white/40 transition-colors hover:text-white/75"
					initial={false}
					onClick={replay}
					style={{ pointerEvents: phase === "active" ? "auto" : "none" }}
					transition={{ duration: 0.3, delay: phase === "active" ? 0.6 : 0 }}
					type="button"
				>
					<svg
						aria-hidden="true"
						className="size-3"
						fill="none"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						viewBox="0 0 24 24"
					>
						<path d="M21 12a9 9 0 1 1-2.64-6.36" />
						<path d="M21 3v6h-6" />
					</svg>
					replay
				</motion.button>
			</div>

			{/* ── Neon-style auth composition ── */}
			<div className="relative z-10 w-full md:pointer-events-none md:absolute md:inset-0">
				<ConnectionsComposition
					authorizeRef={authorizeRef}
					connectionsRef={connectionsRef}
					phase={phase}
					showConnections={step >= 4}
					step={step}
				/>
			</div>
		</div>
	);
}
