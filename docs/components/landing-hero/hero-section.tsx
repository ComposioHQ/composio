"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HeroAddToAgentClickEvent } from "./_stub-events";
import { TrackedLink } from "./_stub-tracked-link";
import { cn } from "@/lib/utils";

// ─── Types & Constants ───────────────────────────────────────
type ToolId = "search" | "connections" | "execute" | "sandbox";

type ChatItem =
	| { type: "user"; content: string }
	| { type: "assistant"; content: string }
	| { type: "tool"; name: string };

// Each example is a sequence of timeline steps with its own chat items
interface ToolMatch {
	name: string;
	description: string;
	appSlug: string;
	highlighted?: boolean;
}

interface SearchResult {
	/** App slug to highlight in the scanning grid */
	highlightSlug: string;
	highlightName: string;
	/** Query that was searched */
	query: string;
	/** Tools found by the search */
	tools: ToolMatch[];
	/** Execution plan steps */
	plan: string[];
	/** Warnings / warnings */
	pitfalls: string[];
}

interface SandboxInstance {
	task: string;
	code: string;
	result: string;
}

interface ExecuteResult {
	tool: string;
	params: { key: string; value: string }[];
	status: string;
}

interface Example {
	chatItems: ChatItem[];
	searchResult: SearchResult;
	sandboxInstances: SandboxInstance[];
	executeResult: ExecuteResult;
	timeline: {
		items: number[];
		activeTools: ToolId[];
		thinking: boolean;
		delay: number;
	}[];
}

const EXAMPLES: Example[] = [
	{
		chatItems: [
			// 0
			{
				type: "user",
				content:
					"Summarize everything important from Slack in the last 48 hours and send a digest to #daily-digest",
			},
			// 1
			{ type: "tool", name: "COMPOSIO SEARCH TOOLS" },
			// 2
			{ type: "tool", name: "COMPOSIO WORKBENCH" },
			// 3
			{
				type: "assistant",
				content:
					"Processed 2,480 messages across 12 channels in workbench. Classified by urgency — 3 critical, 12 important.",
			},
			// 4
			{ type: "tool", name: "COMPOSIO EXECUTE TOOL" },
			// 5
			{
				type: "assistant",
				content:
					"Here's your 48-hour Slack digest. 3 critical items need your attention today.",
			},
		],
		searchResult: {
			highlightSlug: "slack",
			highlightName: "Slack",
			query: "fetch slack messages and summarize",
			tools: [
				{
					name: "SLACK_FETCH_MESSAGES",
					description: "Fetch messages from a Slack channel",
					appSlug: "slack",
					highlighted: true,
				},
				{
					name: "SLACK_LIST_CHANNELS",
					description: "List all channels in a workspace",
					appSlug: "slack",
					highlighted: true,
				},
				{
					name: "SLACK_GET_THREAD",
					description: "Get replies in a message thread",
					appSlug: "slack",
				},
			],
			plan: [
				"List all channels",
				"Fetch messages from last 48h",
				"Classify and summarize in workbench",
			],
			pitfalls: [
				"Large output auto-saved to file if >40k chars",
				"Rate limit: 50 req/min",
			],
		},
		sandboxInstances: [
			{
				task: "Fetch & process messages",
				code: "channels = run_composio_tool(\n  'SLACK_LIST_CHANNELS'\n)\nfor ch in channels:\n  msgs = run_composio_tool(\n    'SLACK_FETCH_MESSAGES',\n    channel=ch['id'],\n    limit=500\n  )\n  smart_file_extract(msgs,\n    out=f'/tmp/{ch[\"name\"]}.json'\n  )",
				result: "2,480 msgs across 12 channels",
			},
			{
				task: "Classify & summarize",
				code: "files = glob('/tmp/*.json')\nall_msgs = []\nfor f in files:\n  all_msgs += json.load(open(f))\n\nranked = invoke_llm(\n  f'Classify {len(all_msgs)} messages'\n  ' by urgency: P0, P1, P2'\n)\nsummary = invoke_llm(\n  f'Summarize the {len(ranked[\"P0\"])}'\n  ' critical items concisely'\n)",
				result: "3 critical, 12 important → 1.2k chars",
			},
		],
		executeResult: {
			tool: "SLACK_SEND_MESSAGE",
			params: [
				{ key: "channel", value: "#daily-digest" },
				{ key: "text", value: "summary (1,240 chars)" },
			],
			status: "200 OK · message sent",
		},
		timeline: [
			{ items: [0], activeTools: [], thinking: false, delay: 950 },
			{ items: [0], activeTools: [], thinking: true, delay: 650 },
			{
				items: [0, 1],
				activeTools: ["search", "connections"],
				thinking: false,
				delay: 2800,
			},
			{
				items: [0, 1, 2],
				activeTools: ["sandbox"],
				thinking: false,
				delay: 3200,
			},
			{ items: [0, 1, 2, 3], activeTools: [], thinking: false, delay: 1200 },
			{
				items: [0, 1, 2, 3, 4],
				activeTools: ["execute"],
				thinking: false,
				delay: 1600,
			},
			{
				items: [0, 1, 2, 3, 4, 5],
				activeTools: [],
				thinking: false,
				delay: 2400,
			},
		],
	},
	{
		chatItems: [
			// 0
			{
				type: "user",
				content:
					"Download all 250 SVGs from our Figma file and upload them to Google Drive",
			},
			// 1
			{ type: "tool", name: "COMPOSIO SEARCH TOOLS" },
			// 2
			{ type: "tool", name: "COMPOSIO WORKBENCH" },
			// 3
			{
				type: "assistant",
				content:
					"Exported 250 SVGs from Figma in 5 batches and uploaded all files to Drive/assets/icons.",
			},
			// 4
			{ type: "tool", name: "COMPOSIO EXECUTE TOOL" },
			// 5
			{
				type: "assistant",
				content: "Done! All 250 SVGs are in your Google Drive. No failures.",
			},
		],
		searchResult: {
			highlightSlug: "figma",
			highlightName: "Figma",
			query: "export figma assets and upload to drive",
			tools: [
				{
					name: "FIGMA_GET_FILE_NODES",
					description: "Get nodes from a Figma file",
					appSlug: "figma",
					highlighted: true,
				},
				{
					name: "FIGMA_EXPORT_ASSETS",
					description: "Export assets as SVG/PNG from Figma",
					appSlug: "figma",
					highlighted: true,
				},
				{
					name: "GOOGLEDRIVE_UPLOAD_FILE",
					description: "Upload a file to Google Drive",
					appSlug: "googledrive",
					highlighted: true,
				},
			],
			plan: [
				"List all component nodes",
				"Batch export as SVG",
				"Upload to Drive folder",
			],
			pitfalls: [
				"Figma API rate limit: 30 req/min",
				"Max 10MB per file upload",
			],
		},
		sandboxInstances: [
			{
				task: "Export Figma assets",
				code: "nodes = run_composio_tool(\n  'FIGMA_GET_FILE_NODES',\n  file_key=file_key\n)\nsvgs = []\nfor batch in chunks(nodes, 50):\n  result = run_composio_tool(\n    'FIGMA_EXPORT_ASSETS',\n    ids=[n['id'] for n in batch],\n    format='svg'\n  )\n  svgs.extend(result['files'])",
				result: "250 SVGs exported",
			},
			{
				task: "Upload to Drive",
				code: "folder = run_composio_tool(\n  'GDRIVE_CREATE_FOLDER',\n  name='assets/icons'\n)\nfor i, svg in enumerate(svgs):\n  upload_local_file(\n    svg,\n    destination=f'{folder}/{i}.svg'\n  )\n  if i % 50 == 0:\n    print(f'{i}/250 uploaded')",
				result: "250/250 uploaded to Drive",
			},
		],
		executeResult: {
			tool: "GOOGLEDRIVE_SHARE_FOLDER",
			params: [
				{ key: "folder", value: "assets/icons" },
				{ key: "files", value: "250 SVGs" },
			],
			status: "200 OK · folder shared",
		},
		timeline: [
			{ items: [0], activeTools: [], thinking: false, delay: 950 },
			{ items: [0], activeTools: [], thinking: true, delay: 650 },
			{
				items: [0, 1],
				activeTools: ["search", "connections"],
				thinking: false,
				delay: 2800,
			},
			{
				items: [0, 1, 2],
				activeTools: ["sandbox"],
				thinking: false,
				delay: 3200,
			},
			{ items: [0, 1, 2, 3], activeTools: [], thinking: false, delay: 1200 },
			{
				items: [0, 1, 2, 3, 4],
				activeTools: ["execute"],
				thinking: false,
				delay: 1600,
			},
			{
				items: [0, 1, 2, 3, 4, 5],
				activeTools: [],
				thinking: false,
				delay: 2400,
			},
		],
	},
	{
		chatItems: [
			// 0
			{
				type: "user",
				content:
					"Triage all open Sentry errors and create Linear issues for P0s",
			},
			// 1
			{ type: "tool", name: "COMPOSIO SEARCH TOOLS" },
			// 2
			{ type: "tool", name: "COMPOSIO WORKBENCH" },
			// 3
			{
				type: "assistant",
				content:
					"Triaged 47 errors in workbench. 5 classified as P0 — created Linear issues LIN-482 through LIN-486 with stack traces.",
			},
			// 4
			{ type: "tool", name: "COMPOSIO EXECUTE TOOL" },
			// 5
			{
				type: "assistant",
				content:
					"All done. 5 P0 issues created in Linear with full stack traces attached.",
			},
		],
		searchResult: {
			highlightSlug: "sentry",
			highlightName: "Sentry",
			query: "list sentry errors and create linear issues",
			tools: [
				{
					name: "SENTRY_LIST_ISSUES",
					description: "List unresolved issues in a project",
					appSlug: "sentry",
					highlighted: true,
				},
				{
					name: "SENTRY_GET_EVENT",
					description: "Get error event details and stack trace",
					appSlug: "sentry",
					highlighted: true,
				},
				{
					name: "LINEAR_CREATE_ISSUE",
					description: "Create a new issue in a Linear team",
					appSlug: "linear",
					highlighted: true,
				},
			],
			plan: [
				"Fetch all open Sentry issues",
				"Classify severity in workbench",
				"Create Linear issues for P0s",
			],
			pitfalls: [
				"Sentry project slug required",
				"Linear team ID must be configured",
			],
		},
		sandboxInstances: [
			{
				task: "Fetch & classify errors",
				code: "issues = run_composio_tool(\n  'SENTRY_LIST_ISSUES',\n  project='api-prod',\n  status='unresolved'\n)\nfor issue in issues:\n  issue['trace'] = run_composio_tool(\n    'SENTRY_GET_EVENT',\n    issue_id=issue['id']\n  )\nranked = invoke_llm(\n  f'Classify these {len(issues)} errors.'\n  ' Return P0/P1/P2 with reasoning.'\n)",
				result: "47 errors → 5 P0, 12 P1, 30 P2",
			},
			{
				task: "Create Linear issues",
				code: "p0s = ranked['P0']\nfor error in p0s:\n  issue = run_composio_tool(\n    'LINEAR_CREATE_ISSUE',\n    title=error['title'],\n    team_id='ENG',\n    priority=1,\n    description=error['trace']\n  )\n  upload_local_file(\n    error['stacktrace'],\n    issue_id=issue['id']\n  )",
				result: "5 issues created: LIN-482 → LIN-486",
			},
		],
		executeResult: {
			tool: "LINEAR_CREATE_ISSUE",
			params: [
				{ key: "team", value: "ENG" },
				{ key: "issues", value: "LIN-482 → LIN-486" },
				{ key: "priority", value: "P0 (urgent)" },
			],
			status: "200 OK · 5 issues created",
		},
		timeline: [
			{ items: [0], activeTools: [], thinking: false, delay: 950 },
			{ items: [0], activeTools: [], thinking: true, delay: 650 },
			{
				items: [0, 1],
				activeTools: ["search", "connections"],
				thinking: false,
				delay: 2800,
			},
			{
				items: [0, 1, 2],
				activeTools: ["sandbox"],
				thinking: false,
				delay: 3200,
			},
			{ items: [0, 1, 2, 3], activeTools: [], thinking: false, delay: 1200 },
			{
				items: [0, 1, 2, 3, 4],
				activeTools: ["execute"],
				thinking: false,
				delay: 1600,
			},
			{
				items: [0, 1, 2, 3, 4, 5],
				activeTools: [],
				thinking: false,
				delay: 2400,
			},
		],
	},
];

// ─── Chat UI Skins ──────────────────────────────────────────
interface ChatSkin {
	name: string;
	subtitle?: string;
	logo: string;
	/** Outer card bg */
	bg: string;
	/** Header bg */
	headerBg: string;
	/** User message bubble bg */
	userBubbleBg: string;
	/** Input area bg */
	inputBg: string;
	/** Text colors */
	textColor: string;
	textMuted: string;
	/** Border color when active */
	borderActive: string;
	/** Border color when inactive */
	borderInactive: string;
	/** Accent / send button color */
	accent: string;
	/** Model label shown in input */
	modelLabel: string;
	/** Thinking indicator: image or dots */
	thinkingType: "logo" | "dots";
	/** Invert logo color */
	invertLogo?: boolean;
	/** Custom shimmer color (defaults to white) */
	shimmerColor?: string;
	/** Rounded corners */
	radius: string;
	/** Agent config metadata */
	agentConfig: {
		agent: string;
		provider: string;
		model: string;
		framework?: string;
	};
}

// Theme-aware chat skins — surface / text / border colors reference
// `--hero-*` CSS vars defined in app/global.css so the chat mocks read
// well in both light and dark docs themes. The per-agent identity is
// expressed through the accent color and chat header logo / radius.
const CHAT_SKINS: ChatSkin[] = [
	{
		name: "Claude",
		subtitle: "Cowork",
		logo: "/images/clients/claude.svg",
		bg: "var(--hero-surface)",
		headerBg: "transparent",
		userBubbleBg: "var(--hero-bubble)",
		inputBg: "var(--hero-surface-2)",
		textColor: "var(--hero-text)",
		textMuted: "var(--hero-text-muted)",
		borderActive: "var(--hero-border)",
		borderInactive: "var(--hero-border-soft)",
		accent: "#c4956a",
		modelLabel: "Sonnet 4.6",
		thinkingType: "logo",
		radius: "20px",
		shimmerColor: "var(--hero-shimmer)",
		agentConfig: {
			agent: "Claude Cowork",
			provider: "Anthropic",
			model: "claude-sonnet-4-6",
			framework: "LangChain",
		},
	},
	{
		name: "ChatGPT",
		subtitle: "Codex",
		logo: "/images/clients/chatgpt.png",
		invertLogo: false,
		bg: "var(--hero-surface)",
		headerBg: "transparent",
		userBubbleBg: "var(--hero-bubble)",
		inputBg: "var(--hero-surface-2)",
		textColor: "var(--hero-text)",
		textMuted: "var(--hero-text-muted)",
		borderActive: "var(--hero-border)",
		borderInactive: "var(--hero-border-soft)",
		accent: "#10a37f",
		modelLabel: "GPT-4.1",
		thinkingType: "dots",
		radius: "14px",
		shimmerColor: "var(--hero-shimmer)",
		agentConfig: {
			agent: "ChatGPT Codex",
			provider: "OpenAI",
			model: "gpt-4.1",
			framework: "CrewAI",
		},
	},
	{
		name: "Your AI Agent",
		logo: "",
		bg: "var(--hero-surface)",
		headerBg: "transparent",
		userBubbleBg: "var(--hero-bubble)",
		inputBg: "var(--hero-surface-2)",
		textColor: "var(--hero-text)",
		textMuted: "var(--hero-text-muted)",
		borderActive: "rgba(0,7,205,0.22)",
		borderInactive: "rgba(0,7,205,0.08)",
		accent: "#0007cd",
		modelLabel: "llama-3.3-70b",
		thinkingType: "dots",
		radius: "20px",
		shimmerColor: "var(--composio-brand)",
		agentConfig: {
			agent: "Your Awesome Agent",
			provider: "Custom",
			model: "llama-3.3-70b",
		},
	},
];

// ─── Layout constants ───────────────────────────────────────
// All widths as % of container so they scale below 1240px
const CARD_W_SIDE_PCT = "27.4%"; // 340/1240
const CHAT_W_PCT = "35.5%"; // 440/1240

const TOOL_IDS: ("search" | "connections" | "execute")[] = [
	"search",
	"connections",
	"execute",
];

const POSITIONS: Record<
	"search" | "connections" | "execute",
	{ x: number; y: number }
> = {
	search: { x: 13.7, y: 7 },
	connections: { x: 86.3, y: 7 },
	execute: { x: 13.7, y: 70 },
};

// Sandbox now lives inside the demo zone — right column under
// Connections, in the slot previously occupied by Execute + AgentConfig.
const SANDBOX_POSITION = { x: 86.3, y: 38 };

const CHAT = { x: 50, y: 7 };

const CONNECTOR_LINES: Record<"search" | "connections" | "execute", string> = {
	search: "M 400 180 L 340 180",
	connections: "M 840 140 L 900 140",
	execute: "M 400 494 L 340 494",
};

const SANDBOX_CONNECTOR = "M 840 355 L 900 355";

// ─── App logos from Composio CDN ─────────────────────────────
const APP_LOGOS: { slug: string; name: string }[] = [
	{ slug: "slack", name: "Slack" },
	{ slug: "gmail", name: "Gmail" },
	{ slug: "notion", name: "Notion" },
	{ slug: "jira", name: "Jira" },
	{ slug: "linear", name: "Linear" },
	{ slug: "asana", name: "Asana" },
	{ slug: "trello", name: "Trello" },
	{ slug: "zoom", name: "Zoom" },
	{ slug: "discord", name: "Discord" },
	{ slug: "figma", name: "Figma" },
	{ slug: "dropbox", name: "Dropbox" },
	{ slug: "stripe", name: "Stripe" },
	{ slug: "shopify", name: "Shopify" },
	{ slug: "hubspot", name: "HubSpot" },
	{ slug: "salesforce", name: "Salesforce" },
	{ slug: "zendesk", name: "Zendesk" },
	{ slug: "github", name: "GitHub" },
	{ slug: "gitlab", name: "GitLab" },
	{ slug: "bitbucket", name: "Bitbucket" },
	{ slug: "googlecalendar", name: "Calendar" },
	{ slug: "googledrive", name: "Drive" },
	{ slug: "googlesheets", name: "Sheets" },
	{ slug: "outlook", name: "Outlook" },
	{ slug: "microsoft_teams", name: "Teams" },
	{ slug: "airtable", name: "Airtable" },
	{ slug: "clickup", name: "ClickUp" },
	{ slug: "todoist", name: "Todoist" },
	{ slug: "intercom", name: "Intercom" },
	{ slug: "mailchimp", name: "Mailchimp" },
	{ slug: "twitter", name: "X" },
	{ slug: "instagram", name: "Instagram" },
	{ slug: "youtube", name: "YouTube" },
	{ slug: "linkedin", name: "LinkedIn" },
	{ slug: "telegram", name: "Telegram" },
	{ slug: "whatsapp", name: "WhatsApp" },
	{ slug: "snowflake", name: "Snowflake" },
	{ slug: "pagerduty", name: "PagerDuty" },
	{ slug: "datadog", name: "Datadog" },
	{ slug: "sentry", name: "Sentry" },
	{ slug: "confluence", name: "Confluence" },
	{ slug: "freshdesk", name: "Freshdesk" },
	{ slug: "calendly", name: "Calendly" },
	{ slug: "typeform", name: "Typeform" },
	{ slug: "mixpanel", name: "Mixpanel" },
	{ slug: "segment", name: "Segment" },
	{ slug: "pipedrive", name: "Pipedrive" },
	{ slug: "coda", name: "Coda" },
	{ slug: "brevo", name: "Brevo" },
	{ slug: "supabase", name: "Supabase" },
	{ slug: "vercel", name: "Vercel" },
	{ slug: "webflow", name: "Webflow" },
	{ slug: "monday", name: "Monday" },
	{ slug: "freshbooks", name: "FreshBooks" },
	{ slug: "elevenlabs", name: "ElevenLabs" },
	{ slug: "spotify", name: "Spotify" },
];

const LOGO_CDN = "https://logos.composio.dev/api";

const AUTH_TYPES: Record<string, string> = {
	slack: "OAuth 2.0",
	figma: "OAuth 2.0",
	googledrive: "OAuth 2.0",
	sentry: "API Key",
	linear: "OAuth 2.0",
	github: "OAuth 2.0",
	gmail: "OAuth 2.0",
};

// ─── Main Component ─────────────────────────────────────────
export function HeroSection() {
	const [isMobile, setIsMobile] = useState<boolean | null>(null);
	const [visibleItems, setVisibleItems] = useState<
		(ChatItem & { id: number })[]
	>([]);
	const heroRef = useRef<HTMLElement>(null);

	// (Landing site mutates the navbar background on scroll; in docs we
	// don't own the navbar so that effect is removed.)
	const [thinking, setThinking] = useState(false);
	const [activatedTools, setActivatedTools] = useState<Set<ToolId>>(new Set());
	const [completedTools, setCompletedTools] = useState<Set<ToolId>>(new Set());
	const nextId = useRef(0);
	const demoRef = useRef<HTMLDivElement>(null);
	const [demoInView, setDemoInView] = useState(false);

	// Current example & step
	const [exampleIdx, setExampleIdx] = useState(0);
	const [step, setStep] = useState(-1);

	useEffect(() => {
		setIsMobile(window.innerWidth < 768);
	}, []);

	// Track whether demo section is visible — pause animation when scrolled away
	useEffect(() => {
		if (!demoRef.current) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				setDemoInView(!!entry?.isIntersecting);
			},
			{ rootMargin: "0px 0px -20% 0px" },
		);
		observer.observe(demoRef.current);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const example = EXAMPLES[exampleIdx % EXAMPLES.length]!;
		const timeline = example.timeline;

		if (step === -1) {
			setActivatedTools(new Set());
			setCompletedTools(new Set());
			setThinking(false);
			// Show first user message immediately, wait for scroll to start
			const firstStep = timeline[0]!;
			setVisibleItems(
				firstStep.items.map((i) => ({
					...example.chatItems[i]!,
					id: exampleIdx * 100 + i,
				})),
			);
			if (!demoInView) return;
			const delay = exampleIdx === 0 ? 100 : 650;
			const t = setTimeout(() => setStep(0), delay);
			return () => clearTimeout(t);
		}

		// Pause timeline when demo is not in view
		if (!demoInView) return;

		if (step >= timeline.length) {
			setExampleIdx((i) => i + 1);
			setStep(-1);
			return;
		}

		const current = timeline[step]!;

		// Show this step's chat items (only from current example)
		setVisibleItems(
			current.items.map((i) => ({
				...example.chatItems[i]!,
				id: exampleIdx * 100 + i,
			})),
		);

		setThinking(current.thinking);

		if (current.activeTools.length > 0) {
			// Sequence per beat:
			//   (1) chat tool item fades in (~250ms — framer transition)
			//   (2) connector line draws from chat to card (~250ms — see
			//       `delay: 0.25, duration: 0.25` on the motion.path below)
			//   (3) card lights up at the end of the draw (~500ms total).
			const drawDuration = 500;
			const t2 = setTimeout(() => {
				setActivatedTools(new Set(current.activeTools));
			}, drawDuration);
			const t = setTimeout(() => {
				setCompletedTools((prev) => new Set([...prev, ...current.activeTools]));
				setStep((s) => s + 1);
			}, current.delay);
			return () => {
				clearTimeout(t);
				clearTimeout(t2);
			};
		}

		setActivatedTools(new Set());
		const t = setTimeout(() => setStep((s) => s + 1), current.delay);
		return () => clearTimeout(t);
	}, [step, exampleIdx, demoInView]);

	const activeSet = new Set(
		step >= 0 &&
			step < (EXAMPLES[exampleIdx % EXAMPLES.length]?.timeline.length ?? 0)
			? (EXAMPLES[exampleIdx % EXAMPLES.length]?.timeline[step]?.activeTools ??
					[])
			: [],
	);

	return (
		<section className="relative flex flex-col items-center overflow-hidden">
			{/* Headline */}
			<div
				className="relative mx-auto flex w-full max-w-[1240px] flex-col items-center justify-center gap-6 px-4 pt-2 pb-2 md:gap-8 md:pt-4 md:pb-3"
				ref={heroRef as React.RefObject<HTMLDivElement>}
			>
				{/* Text content */}
				<div className="relative z-10 flex flex-col items-center gap-2 px-1 md:gap-3">
					<h1 className="text-center font-sans text-4xl text-fd-foreground leading-[1.05] tracking-[-0.02em] md:whitespace-nowrap md:text-5xl md:leading-[0.95] lg:text-[56px]">
						Your agent decides
						<br className="md:hidden" /> what to do.
					</h1>
					<p className="text-center font-sans text-4xl text-fd-foreground leading-[1.05] tracking-[-0.02em] md:whitespace-nowrap md:text-5xl md:leading-[0.95] lg:text-[56px]">
						We handle the rest.
					</p>
				</div>

				{/* Primary CTA */}
				<div className="relative z-10">
					<TrackedLink
						baseUrl="/docs/quickstart"
						className="inline-flex items-center bg-[var(--composio-brand)] px-5 py-3 font-mono text-sm uppercase leading-normal tracking-[-0.28px] no-underline transition-colors hover:bg-[#0006a8]"
						event={HeroAddToAgentClickEvent}
						placement="hero-get-started"
						style={{ color: "#ffffff" }}
					>
						<span style={{ color: "#ffffff" }}>Get Started</span>
					</TrackedLink>
				</div>
			</div>

			{/* Demo — desktop only */}
			<div
				className="relative mt-6 hidden h-[620px] w-full max-w-[1240px] lg:block"
				ref={demoRef}
			>
				{/* Connector lines — paths use `currentColor`, so they pick up
				    this brand-blue tone in both light and dark mode. */}
				<svg
					className="pointer-events-none absolute inset-0 z-[1] h-full w-full text-[var(--composio-brand)]"
					fill="none"
					preserveAspectRatio="none"
					viewBox="0 0 1240 620"
				>
					{TOOL_IDS.map((id) => {
						const line = CONNECTOR_LINES[id];
						const isActive = activeSet.has(id);
						return (
							<g key={id}>
								<AnimatePresence>
									{isActive && (
										<>
											<motion.path
												animate={{ pathLength: 1 }}
												d={line}
												exit={{ opacity: 0, transition: { duration: 0.3 } }}
												initial={{ pathLength: 0 }}
												key={`${id}-glow`}
												pathLength={1}
												stroke="currentColor"
												strokeLinecap="round"
												strokeOpacity={0.15}
												strokeWidth={8}
												transition={{ duration: 0.25, delay: 0.25, ease: "easeOut" }}
											/>
											<motion.path
												animate={{ pathLength: 1 }}
												d={line}
												exit={{ opacity: 0, transition: { duration: 0.3 } }}
												initial={{ pathLength: 0 }}
												key={`${id}-line`}
												pathLength={1}
												stroke="currentColor"
												strokeLinecap="round"
												strokeWidth={2}
												transition={{ duration: 0.25, delay: 0.25, ease: "easeOut" }}
											/>
										</>
									)}
								</AnimatePresence>
							</g>
						);
					})}
					{/* Sandbox connector — vertical from chat bottom to container edge */}
					<g>
						<AnimatePresence>
							{activeSet.has("sandbox") && (
								<>
									<motion.path
										animate={{ pathLength: 1 }}
										d={SANDBOX_CONNECTOR}
										exit={{ opacity: 0, transition: { duration: 0.3 } }}
										initial={{ pathLength: 0 }}
										key="sandbox-glow"
										pathLength={1}
										stroke="currentColor"
										strokeLinecap="round"
										strokeOpacity={0.15}
										strokeWidth={8}
										transition={{ duration: 0.25, delay: 0.25, ease: "easeOut" }}
									/>
									<motion.path
										animate={{ pathLength: 1 }}
										d={SANDBOX_CONNECTOR}
										exit={{ opacity: 0, transition: { duration: 0.3 } }}
										initial={{ pathLength: 0 }}
										key="sandbox-line"
										pathLength={1}
										stroke="currentColor"
										strokeLinecap="round"
										strokeWidth={2}
										transition={{ duration: 0.25, delay: 0.25, ease: "easeOut" }}
									/>
								</>
							)}
						</AnimatePresence>
					</g>
				</svg>

				{/* Chat window — skinned per example with sweep transition */}
				<AnimatePresence mode="wait">
					{(() => {
						const skin = CHAT_SKINS[exampleIdx % CHAT_SKINS.length]!;
						return (
							<motion.div
								animate={{
									opacity: demoInView ? 1 : 0.5,
									scale: demoInView ? 1 : 0.98,
									x: "-50%",
									y: 0,
								}}
								className="absolute z-10 flex flex-col overflow-hidden border shadow-2xl"
								exit={{
									opacity: 0,
									y: -40,
									transition: { duration: 0.35, ease: "easeIn" },
								}}
								initial={
									exampleIdx === 0 && !demoInView
										? { opacity: 0.5, scale: 0.98, x: "-50%", y: 0 }
										: { opacity: 0, x: "-50%", y: 40 }
								}
								key={`chat-skin-${exampleIdx}`}
								style={{
									width: CHAT_W_PCT,
									left: `${CHAT.x}%`,
									top: `${CHAT.y}%`,
									backgroundColor: skin.bg,
									borderColor: demoInView
										? skin.borderActive
										: skin.borderInactive,
									borderRadius: skin.radius,
								}}
								transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
							>
								{/* Header */}
								<div
									className="flex items-center justify-center gap-2 px-5 py-3"
									style={{ backgroundColor: skin.headerBg }}
								>
									{skin.logo ? (
										<img
											alt={skin.name}
											className={cn("h-4 w-4", skin.invertLogo && "invert")}
											src={skin.logo}
										/>
									) : (
										<div
											className="flex h-4 w-4 items-center justify-center rounded-full"
											style={{ backgroundColor: skin.accent }}
										>
											<svg
												fill="none"
												height="10"
												viewBox="0 0 10 10"
												width="10"
											>
												<path
													d="M2.5 3.5L5 6L7.5 3.5"
													stroke="white"
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth="1.5"
												/>
											</svg>
										</div>
									)}
									<span
										className="font-medium text-[13px]"
										style={{ color: skin.textColor }}
									>
										{skin.name}
										{skin.subtitle && (
											<>
												{" "}
												<span
													className="font-normal"
													style={{ color: skin.textMuted }}
												>
													{skin.subtitle}
												</span>
											</>
										)}
									</span>
								</div>

								{/* Chat items */}
								<ChatScroller items={visibleItems}>
									<AnimatePresence mode="popLayout">
										{visibleItems.map((item, idx) => {
											const isLatest = idx === visibleItems.length - 1;
											return (
												<motion.div
													animate={{
														opacity: isLatest ? 1 : 0.35,
														y: 0,
														scale: 1,
													}}
													exit={{ opacity: 0, scale: 0.95 }}
													initial={{ opacity: 0, y: 8, scale: 0.97 }}
													key={item.id}
													layout
													transition={{ duration: 0.25 }}
												>
													{item.type === "user" && (
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
													)}
													{item.type === "tool" && (
														<div
															className={cn(
																"inline-flex items-center gap-1 text-[12px] leading-none tracking-wide",
																isLatest && "hero-tool-shimmer",
															)}
															style={
																isLatest ? undefined : { color: skin.textMuted }
															}
														>
															<span className="font-medium uppercase">
																{item.name}
															</span>
															<ChevronRight className="h-3 w-3" />
														</div>
													)}
													{item.type === "assistant" && (
														<div
															className="text-[15px] leading-relaxed"
															style={{ color: skin.textColor }}
														>
															{item.content}
														</div>
													)}
												</motion.div>
											);
										})}
										{thinking && (
											<motion.div
												animate={{ opacity: 1, y: 0 }}
												exit={{ opacity: 0 }}
												initial={{ opacity: 0, y: 8 }}
												key="dots"
												layout
											>
												{skin.thinkingType === "logo" && skin.logo ? (
													<img
														alt={skin.name}
														className="h-6 w-6"
														src={skin.logo}
													/>
												) : (
													<div className="flex gap-1">
														{[0, 1, 2].map((i) => (
															<div
																className="h-1.5 w-1.5 animate-[pulse-dot_1.4s_ease-in-out_infinite] rounded-full"
																key={i}
																style={{
																	backgroundColor: skin.accent,
																	animationDelay: `${i * 0.2}s`,
																}}
															/>
														))}
													</div>
												)}
											</motion.div>
										)}
									</AnimatePresence>
								</ChatScroller>

								{/* Input */}
								<div className="px-3 pb-3">
									<div
										className="flex flex-col gap-2 px-4 pt-3 pb-2.5"
										style={{
											backgroundColor: skin.inputBg,
											borderRadius: `calc(${skin.radius} - 4px)`,
										}}
									>
										<span
											className="text-[14px]"
											style={{ color: skin.textMuted }}
										>
											Reply...
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
													className="inline-flex items-center text-[12px] leading-none"
													style={{ color: skin.textMuted }}
												>
													{skin.modelLabel}
													<ChevronRight className="ml-0.5 h-3 w-3" />
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
							</motion.div>
						);
					})()}
				</AnimatePresence>

				{/* Tool cards */}
				<SearchCard
					active={activatedTools.has("search")}
					completed={completedTools.has("search")}
					searchResult={EXAMPLES[exampleIdx % EXAMPLES.length]!.searchResult}
				/>
				<ConnectionsCard
					active={activatedTools.has("connections")}
					completed={completedTools.has("connections")}
					connectedApps={EXAMPLES[
						exampleIdx % EXAMPLES.length
					]!.searchResult.tools.map((t) => ({
						name: t.appSlug.charAt(0).toUpperCase() + t.appSlug.slice(1),
						slug: t.appSlug,
					}))}
				/>
				<ExecuteCard
					active={activatedTools.has("execute")}
					completed={completedTools.has("execute")}
					executeResult={EXAMPLES[exampleIdx % EXAMPLES.length]!.executeResult}
				/>

				{/* Sandbox card — now positioned inside the demo zone, right
				    column under Connections (the slot previously occupied by
				    Execute + AgentConfig). */}
				<SandboxCard
					active={activatedTools.has("sandbox")}
					completed={completedTools.has("sandbox")}
					instances={EXAMPLES[exampleIdx % EXAMPLES.length]!.sandboxInstances}
				/>
			</div>
		</section>
	);
}

// ─── Chat Scroller ───────────────────────────────────────────
function ChatScroller({
	items,
	children,
}: {
	items: unknown[];
	children: React.ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (ref.current) {
			ref.current.scrollTo({
				top: ref.current.scrollHeight,
				behavior: "smooth",
			});
		}
	}, [items.length]);

	return (
		<div
			className="scrollbar-none flex h-[380px] flex-col gap-4 overflow-y-auto px-5 pt-5 pb-3"
			ref={ref}
			style={{ scrollbarWidth: "none" }}
		>
			{children}
		</div>
	);
}

// ─── Shared Card Wrapper ─────────────────────────────────────
function Card({
	id,
	active,
	className,
	children,
}: {
	id: "search" | "connections" | "execute";
	active: boolean;
	className?: string;
	children: React.ReactNode;
}) {
	const p = POSITIONS[id];
	return (
		<motion.div
			animate={{ opacity: active ? 1 : 0.7 }}
			className={cn(
				"absolute z-[5] flex flex-col overflow-hidden border border-fd-border bg-fd-card p-4 font-mono text-xs transition-shadow duration-300",
				active && "hero-card-shadow",
				className,
			)}
			style={{
				width: CARD_W_SIDE_PCT,
				left: `${p.x}%`,
				top: `${p.y}%`,
				transform: "translateX(-50%)",
			}}
			transition={{ duration: 0.5 }}
		>
			{children}
		</motion.div>
	);
}

// ─── Search Card ─────────────────────────────────────────────
function SearchCard({
	active,
	completed,
	searchResult,
}: {
	active: boolean;
	completed: boolean;
	searchResult: SearchResult;
}) {
	const [phase, setPhase] = useState<
		"idle" | "scanning" | "highlighted" | "found"
	>("idle");
	const prevActive = useRef(false);
	const prevSlug = useRef(searchResult.highlightSlug);

	// Reset phase when example changes (new search result)
	useEffect(() => {
		if (prevSlug.current !== searchResult.highlightSlug) {
			setPhase("idle");
			prevActive.current = false;
			prevSlug.current = searchResult.highlightSlug;
		}
	}, [searchResult.highlightSlug]);

	useEffect(() => {
		if (active && !prevActive.current) {
			setPhase("scanning");
			const t1 = setTimeout(() => setPhase("highlighted"), 950);
			const t2 = setTimeout(() => setPhase("found"), 1750);
			prevActive.current = active;
			return () => {
				clearTimeout(t1);
				clearTimeout(t2);
			};
		}
		if (!active && prevActive.current && !completed) {
			setPhase("idle");
		}
		prevActive.current = active;
	}, [active, completed]);

	const showScanning =
		!completed && (phase === "scanning" || phase === "highlighted");
	const showResults = phase === "found" || completed;
	const showIdle = phase === "idle" && !completed;

	return (
		<Card active={active} className="h-[360px]" id="search">
			<div className="mb-1 text-[10px] text-fd-foreground/30 uppercase tracking-wider">
				composio_search_tools
			</div>

			<div className="min-h-0 flex-1">
				{/* Idle state — show stale/sample results */}
				{showIdle && (
					<div className="flex h-full flex-col font-sans">
						<div className="mb-2 flex items-center gap-2 border border-fd-border px-2.5 py-1.5">
							<svg
								className="shrink-0 text-fd-foreground/20"
								fill="none"
								height="12"
								viewBox="0 0 12 12"
								width="12"
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
							<span className="truncate font-mono text-[10px] text-fd-foreground/25">
								search tools...
							</span>
						</div>
						<div className="flex flex-col gap-1.5">
							{[
								{
									name: "GMAIL_SEND_EMAIL",
									desc: "Send an email via Gmail",
									slug: "gmail",
								},
								{
									name: "SLACK_LIST_CHANNELS",
									desc: "List channels in workspace",
									slug: "slack",
								},
								{
									name: "GITHUB_CREATE_PR",
									desc: "Create a pull request",
									slug: "github",
								},
							].map((t) => (
								<div
									className="flex items-start gap-2.5 border border-fd-border px-2.5 py-2"
									key={t.name}
								>
									<img
										alt={t.slug}
										className="mt-0.5 h-[14px] w-[14px] shrink-0 object-contain opacity-30"
										draggable={false}
										src={`${LOGO_CDN}/${t.slug}`}
									/>
									<div className="min-w-0 flex-1">
										<div className="truncate font-mono text-[11px] text-fd-foreground/25 leading-tight">
											{t.name}
										</div>
										<div className="mt-0.5 truncate text-[10px] text-fd-foreground/15 leading-tight">
											{t.desc}
										</div>
									</div>
								</div>
							))}
						</div>
						<div className="mt-3 grid grid-cols-2 gap-2">
							<div>
								<div className="mb-1 font-mono text-[9px] text-fd-foreground/15 uppercase tracking-wider">
									Plan
								</div>
								<div className="flex flex-col gap-0.5">
									<div className="flex items-start gap-1.5 font-mono text-[10px] text-fd-foreground/15 leading-tight">
										<span>1</span>
										<span>Authenticate user</span>
									</div>
									<div className="flex items-start gap-1.5 font-mono text-[10px] text-fd-foreground/15 leading-tight">
										<span>2</span>
										<span>Execute tool call</span>
									</div>
								</div>
							</div>
							<div>
								<div className="mb-1 font-mono text-[9px] text-fd-foreground/15 uppercase tracking-wider">
									Warnings
								</div>
								<div className="flex flex-col gap-0.5">
									<div className="flex items-start gap-1.5 font-mono text-[10px] text-fd-foreground/15 leading-tight">
										<span>!</span>
										<span>Check rate limits</span>
									</div>
									<div className="flex items-start gap-1.5 font-mono text-[10px] text-fd-foreground/15 leading-tight">
										<span>!</span>
										<span>Verify permissions</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				)}

				{/* Search bar — visible during scanning and highlighted */}
				{showScanning && (
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="mb-2 flex items-center gap-2 border border-fd-border bg-fd-accent/30 px-2.5 py-1.5"
						initial={{ opacity: 0, y: 4 }}
						transition={{ duration: 0.25 }}
					>
						<svg
							className="shrink-0 text-fd-foreground/20"
							fill="none"
							height="12"
							viewBox="0 0 12 12"
							width="12"
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
						<span className="truncate font-mono text-[10px] text-fd-foreground/35">
							{searchResult.query}
						</span>
						{phase === "scanning" && (
							<span className="ml-auto shrink-0 animate-pulse font-mono text-[9px] text-fd-foreground/20">
								searching...
							</span>
						)}
						{phase === "highlighted" && (
							<span className="ml-auto shrink-0 font-mono text-[9px] text-fd-foreground/20">
								{searchResult.tools.length} found
							</span>
						)}
					</motion.div>
				)}

				{showScanning && (
					<div
						className="relative h-full overflow-hidden"
						style={{
							maskImage:
								"linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
							WebkitMaskImage:
								"linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
						}}
					>
						<AnimatePresence mode="wait">
							{phase === "scanning" ? (
								<motion.div
									animate={{
										y: [0, `-${Math.ceil(APP_LOGOS.length / 7) * 31.5}px`],
									}}
									className="grid grid-cols-7 gap-1.5"
									exit={{ opacity: 0 }}
									key="scanning"
									transition={{
										duration: 1.2,
										ease: "linear",
										repeat: Number.POSITIVE_INFINITY,
									}}
								>
									{[...APP_LOGOS, ...APP_LOGOS].map((app, i) => (
										<div
											className="flex h-[30px] w-[30px] items-center justify-center"
											key={`${app.slug}-${i < APP_LOGOS.length ? "a" : "b"}`}
										>
											<img
												alt={app.name}
												className="h-[18px] w-[18px] object-contain"
												draggable={false}
												src={`${LOGO_CDN}/${app.slug}`}
											/>
										</div>
									))}
								</motion.div>
							) : (
								<motion.div
									animate={{ opacity: 1 }}
									className="grid grid-cols-7 gap-1.5"
									initial={{ opacity: 0 }}
									key="highlighted"
									transition={{ duration: 0.4 }}
								>
									{APP_LOGOS.map((app) => {
										const isTarget = app.slug === searchResult.highlightSlug;
										const highlighted = phase === "highlighted" && isTarget;
										const dimmed = phase === "highlighted" && !isTarget;
										return (
											<div
												className={cn(
													"flex h-[30px] w-[30px] items-center justify-center transition-all duration-500",
													highlighted
														? "bg-[var(--composio-brand)]/10 ring-2 ring-[var(--composio-brand)]/45 ring-offset-0"
														: dimmed
															? "opacity-20"
															: "",
												)}
												key={app.slug}
											>
												<img
													alt={app.name}
													className="h-[18px] w-[18px] object-contain"
													draggable={false}
													src={`${LOGO_CDN}/${app.slug}`}
												/>
											</div>
										);
									})}
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				)}

				{showResults && (
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="flex h-full flex-col"
						initial={{ opacity: 0, y: 6 }}
						transition={{ duration: 0.3 }}
					>
						{/* Search query bar */}
						<div className="mb-3 flex items-center gap-2 border border-fd-border bg-fd-accent/30 px-2.5 py-1.5">
							<svg
								className="shrink-0 text-fd-foreground/20"
								fill="none"
								height="12"
								viewBox="0 0 12 12"
								width="12"
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
							<span className="truncate font-mono text-[10px] text-fd-foreground/35">
								{searchResult.query}
							</span>
							<span className="ml-auto shrink-0 font-mono text-[9px] text-fd-foreground/20">
								{searchResult.tools.length} found
							</span>
						</div>

						{/* Tool results */}
						<div className="flex flex-col gap-1.5">
							{searchResult.tools.map((tool) => (
								<div
									className="flex items-start gap-2.5 border border-fd-border bg-fd-accent/30 px-2.5 py-2"
									key={tool.name}
								>
									<img
										alt={tool.appSlug}
										className="mt-0.5 h-[14px] w-[14px] shrink-0 object-contain"
										draggable={false}
										src={`${LOGO_CDN}/${tool.appSlug}`}
									/>
									<div className="min-w-0 flex-1">
										<div className="truncate font-mono text-[11px] text-fd-foreground/40 leading-tight">
											{tool.name}
										</div>
										<div className="mt-0.5 truncate text-[10px] text-fd-foreground/20 leading-tight">
											{tool.description}
										</div>
									</div>
									{tool.highlighted && (
										<span className="mt-0.5 shrink-0 bg-blue-500/20 px-1 py-px font-mono text-[8px] text-blue-400 uppercase tracking-wider">
											match
										</span>
									)}
								</div>
							))}
						</div>

						{/* Plan & Warnings */}
						<div className="mt-3 grid grid-cols-2 gap-2">
							<div>
								<div className="mb-1 font-mono text-[9px] text-fd-foreground/25 uppercase tracking-wider">
									Plan
								</div>
								<div className="flex flex-col gap-0.5">
									{searchResult.plan.map((step, i) => (
										<div
											className="flex items-start gap-1.5 font-mono text-[10px] text-fd-foreground/35 leading-tight"
											key={step}
										>
											<span className="text-fd-foreground/15">{i + 1}</span>
											<span>{step}</span>
										</div>
									))}
								</div>
							</div>
							<div>
								<div className="mb-1 font-mono text-[9px] text-amber-500/40 uppercase tracking-wider">
									Warnings
								</div>
								<div className="flex flex-col gap-0.5">
									{searchResult.pitfalls.map((pitfall) => (
										<div
											className="flex items-start gap-1.5 font-mono text-[10px] text-fd-foreground/25 leading-tight"
											key={pitfall}
										>
											<span className="text-amber-500/40">!</span>
											<span>{pitfall}</span>
										</div>
									))}
								</div>
							</div>
						</div>
					</motion.div>
				)}
			</div>
		</Card>
	);
}

// ─── Other Tool Cards ────────────────────────────────────────
function ConnectionsCard({
	active,
	completed,
	connectedApps,
}: {
	active: boolean;
	completed: boolean;
	connectedApps: { name: string; slug: string }[];
}) {
	// Deduplicate apps by slug
	const uniqueApps = connectedApps.filter(
		(app, i, arr) => arr.findIndex((a) => a.slug === app.slug) === i,
	);

	return (
		<Card active={active} className="h-[174px]" id="connections">
			<div className="mb-4 text-[10px] text-fd-foreground/30 uppercase tracking-wider">
				composio_manage_connections
			</div>
			<div className="mb-4 text-[10px] text-fd-foreground/20">USER_ID: usr_9x2kLm7</div>
			<div className="flex flex-1 flex-col gap-2">
				{uniqueApps.map((app) => {
					const isConnected = active || completed;
					const authType = AUTH_TYPES[app.slug] ?? "OAuth 2.0";
					return (
						<div
							className={cn(
								"flex items-center justify-between border px-2.5 py-2",
								isConnected
									? "border-fd-border bg-fd-accent/30"
									: "border-fd-border",
							)}
							key={app.slug}
						>
							<div className="flex items-center gap-2">
								<img
									alt={app.name}
									className={cn(
										"h-[14px] w-[14px] object-contain",
										isConnected ? "opacity-80" : "opacity-20",
									)}
									draggable={false}
									src={`${LOGO_CDN}/${app.slug}`}
								/>
								<div className="flex flex-col">
									<span
										className={cn(
											"text-[11px] leading-tight",
											isConnected ? "text-fd-foreground/50" : "text-fd-foreground/20",
										)}
									>
										{app.name}
									</span>
									<span
										className={cn(
											"text-[9px] leading-tight",
											isConnected ? "text-fd-foreground/25" : "text-fd-foreground/10",
										)}
									>
										{authType}
									</span>
								</div>
							</div>
							<span
								className={cn(
									"flex items-center gap-1.5 text-[10px]",
									isConnected ? "text-green-400" : "text-fd-foreground/20",
								)}
							>
								<span
									className={cn(
										"inline-block h-1.5 w-1.5 rounded-full",
										isConnected ? "bg-green-400" : "bg-fd-accent",
										isConnected && "animate-pulse",
									)}
								/>
								{isConnected ? "Connected" : "—"}
							</span>
						</div>
					);
				})}
			</div>
		</Card>
	);
}

function ExecuteCard({
	active,
	completed,
	executeResult,
}: {
	active: boolean;
	completed: boolean;
	executeResult: ExecuteResult;
}) {
	return (
		<Card active={active} className="h-[174px]" id="execute">
			<div className="mb-3 flex items-center justify-between">
				<div className="text-[10px] text-fd-foreground/30 uppercase tracking-wider">
					composio_execute_tool
				</div>
				<div className="text-[10px] text-fd-foreground/20">
					SESSION: {active || completed ? "sx-7k2m" : "—"}
				</div>
			</div>
			{active || completed ? (
				<div className="flex flex-1 flex-col gap-2">
					<div className="flex items-center gap-2 border border-fd-border bg-fd-accent/30 px-2.5 py-2">
						<img
							alt={executeResult.tool.split("_")[0]?.toLowerCase()}
							className="h-[14px] w-[14px] shrink-0 object-contain opacity-80"
							draggable={false}
							src={`${LOGO_CDN}/${executeResult.tool.split("_")[0]?.toLowerCase()}`}
						/>
						<span className="font-mono text-[11px] text-fd-foreground/50 leading-tight">
							{executeResult.tool}
						</span>
					</div>
					<div className="flex flex-col gap-1 border border-fd-border px-2.5 py-2">
						{executeResult.params.map((p) => (
							<div
								className="flex items-center justify-between text-[10px]"
								key={p.key}
							>
								<span className="text-fd-foreground/25">{p.key}</span>
								<span className="text-fd-foreground/40">{p.value}</span>
							</div>
						))}
					</div>
					<div className="flex items-center gap-1.5 text-[10px] text-green-400">
						<Check className="h-3 w-3" />
						<span>{executeResult.status}</span>
					</div>
				</div>
			) : (
				<div className="flex flex-1 flex-col gap-2">
					<div className="flex items-center gap-2 border border-fd-border px-2.5 py-2">
						<img
							alt="notion"
							className="h-[14px] w-[14px] shrink-0 object-contain opacity-20"
							draggable={false}
							src={`${LOGO_CDN}/notion`}
						/>
						<span className="font-mono text-[11px] text-fd-foreground/20 leading-tight">
							NOTION_CREATE_PAGE
						</span>
					</div>
					<div className="flex flex-col gap-1 border border-fd-border px-2.5 py-2">
						<div className="flex items-center justify-between text-[10px]">
							<span className="text-fd-foreground/15">db</span>
							<span className="text-fd-foreground/20">Tasks</span>
						</div>
						<div className="flex items-center justify-between text-[10px]">
							<span className="text-fd-foreground/15">title</span>
							<span className="text-fd-foreground/20">Q4 roadmap</span>
						</div>
					</div>
					<div className="flex items-center gap-1.5 text-[10px] text-fd-foreground/15">
						<Check className="h-3 w-3" />
						<span>200 OK · page created</span>
					</div>
				</div>
			)}
		</Card>
	);
}

// Simple 2D noise for CPU lights
function noise2d(x: number, y: number, t: number): number {
	const n = Math.sin(x * 12.9898 + y * 78.233 + t * 43.758) * 43758.5453;
	return n - Math.floor(n);
}

// CPU activity lights — noise-driven blinking blue squares
function CpuLights({ active, cols = 6 }: { active: boolean; cols?: number }) {
	const COLS = cols;
	const ROWS = 2;
	const [tick, setTick] = useState(0);

	useEffect(() => {
		if (!active) return;
		const id = setInterval(() => setTick((t) => t + 1), 80);
		return () => clearInterval(id);
	}, [active]);

	return (
		<div
			className="inline-grid gap-[2px]"
			style={{
				gridTemplateColumns: `repeat(${COLS}, 5px)`,
				gridTemplateRows: `repeat(${ROWS}, 5px)`,
			}}
		>
			{Array.from({ length: ROWS * COLS }).map((_, idx) => {
				const col = idx % COLS;
				const row = Math.floor(idx / COLS);
				const wave = Math.sin((col * 0.5 - tick * 0.15) * Math.PI) * 0.5 + 0.5;
				const n = noise2d(col * 0.6, row * 0.7, tick * 0.08) * 0.4 + wave * 0.6;
				const lit = active && n > 0.25;
				const brightness = n > 0.7 ? 2 : n > 0.5 ? 1 : 0;
				return (
					<div
						className={cn(
							"h-[5px] w-[5px] transition-colors duration-300",
							!lit && "bg-fd-accent/30",
							lit && brightness === 2 && "bg-blue-400",
							lit && brightness === 1 && "bg-blue-500/70",
							lit && brightness === 0 && "bg-blue-600/40",
						)}
						key={idx}
					/>
				);
			})}
		</div>
	);
}


function SandboxCard({
	active,
	completed,
	instances,
}: {
	active: boolean;
	completed: boolean;
	instances: SandboxInstance[];
}) {
	const [visibleCount, setVisibleCount] = useState(0);
	const prevActive = useRef(false);
	const prevInstances = useRef(instances);

	useEffect(() => {
		if (prevInstances.current !== instances) {
			setVisibleCount(0);
			prevActive.current = false;
			prevInstances.current = instances;
		}
	}, [instances]);

	useEffect(() => {
		if (active && !prevActive.current) {
			prevActive.current = true;
			// Show first instance immediately
			setVisibleCount(1);
			let count = 1;
			const interval = setInterval(() => {
				count++;
				setVisibleCount(count);
				if (count >= instances.length) {
					clearInterval(interval);
				}
			}, 1800);
			return () => clearInterval(interval);
		}
		if (!active && prevActive.current && !completed) {
			setVisibleCount(0);
		}
		prevActive.current = active;
	}, [active, completed, instances.length]);

	const visibleIdx = completed ? instances.length : visibleCount;

	return (
		<motion.div
			animate={{ opacity: active || completed ? 1 : 0.7 }}
			className={cn(
				"absolute z-[5] flex flex-col overflow-hidden border border-fd-border bg-fd-card p-3 font-mono text-xs transition-shadow duration-300",
				active && "hero-card-shadow",
			)}
			style={{
				width: CARD_W_SIDE_PCT,
				left: `${SANDBOX_POSITION.x}%`,
				top: `${SANDBOX_POSITION.y}%`,
				transform: "translateX(-50%)",
				height: "360px",
			}}
			transition={{ duration: 0.5 }}
		>
			{/* Header */}
			<div className="mb-2 flex items-center justify-between">
				<div className="text-[10px] text-fd-foreground/30 uppercase tracking-wider">
					composio_workbench
				</div>
				<div className="flex items-center gap-1.5 text-[9px] text-fd-foreground/20">
					<span
						className={cn(
							"h-1.5 w-1.5 rounded-full",
							active ? "animate-pulse bg-green-400" : "bg-fd-accent",
						)}
					/>
					python 3.11
				</div>
			</div>

			{/* Instances — stacked vertically inside the right-column sandbox slot */}
			<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
				{instances.map((inst, i) => {
					const isActive = i < visibleIdx;
					const isDone = isActive && (completed || i < visibleIdx - 1);
					const isRunning = isActive && !isDone && active;

					return (
						<div
							className={cn(
								"flex min-h-0 flex-1 flex-col border transition-all duration-300",
								isRunning
									? "border-fd-border bg-fd-muted"
									: isActive
										? "border-fd-border bg-fd-muted"
										: "border-fd-border border-dashed bg-transparent",
							)}
							key={i}
						>
							{/* Toolbar — compact single row: CPU lights + task name on
							    the left, status on the right. `min-w-0` + `truncate`
							    keeps long task/result strings on one line in the
							    narrow right-column slot. */}
							<div className="flex items-center justify-between gap-2 border-fd-border border-b px-2 py-1.5">
								{isActive ? (
									<>
										<div className="flex min-w-0 items-center gap-1.5">
											<CpuLights active={isRunning} cols={4} />
											<span className="truncate text-[9px] text-fd-foreground/40 uppercase tracking-wider">
												{inst.task}
											</span>
										</div>
										<span
											className={cn(
												"shrink-0 text-[8px] uppercase tracking-wider",
												isDone
													? "text-[var(--composio-brand)]"
													: "text-fd-foreground/30",
											)}
										>
											{isDone ? "done" : isRunning ? "running" : ""}
										</span>
									</>
								) : (
									<>
										<div className="flex min-w-0 items-center gap-1.5">
											<CpuLights active={false} cols={4} />
											<span className="truncate text-[9px] text-fd-foreground/20 uppercase tracking-wider">
												instance-{i}
											</span>
										</div>
										<span className="shrink-0 text-[8px] text-fd-foreground/20 uppercase tracking-wider">
											idle
										</span>
									</>
								)}
							</div>
							{/* Code / placeholder — bottom-fade mask so long snippets
							    feather out instead of getting clipped flat. */}
							<div
								className="relative min-h-0 flex-1 overflow-hidden px-2 py-1.5"
								style={{
									maskImage:
										"linear-gradient(to bottom, black 0%, black 70%, transparent 100%)",
									WebkitMaskImage:
										"linear-gradient(to bottom, black 0%, black 70%, transparent 100%)",
								}}
							>
								<pre
									className={cn(
										"overflow-hidden font-mono text-[9px] leading-[1.5]",
										isActive
											? "text-fd-foreground/55"
											: "text-fd-foreground/15",
									)}
								>
									{isActive
										? inst.code
										: i === 0
											? `data = run_composio_tool(
  'NOTION_QUERY_DB',
  database='Tasks'
)
results = invoke_llm(
  f'Summarize {len(data)} items'
)`
											: `pages = run_composio_tool(
  'NOTION_LIST_PAGES',
  limit=50
)
for p in pages:
  proxy_execute(p['url'])
`}
								</pre>
							</div>
						</div>
					);
				})}
			</div>
		</motion.div>
	);
}
