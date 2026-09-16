/* oxlint-disable next/no-img-element -- Satori renders raw <img>, next/image does not apply here */
import { ImageResponse } from 'next/og';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Social preview cards for every docs page. One shared shell, one slot per
// section. Palette and type follow app/global.css: dark DEV surface by
// default, light on request, deep electric blue brand accent, square corners.
// Geist Sans / Mono are vendored in app/fonts because Satori cannot read the
// site's woff2 files.

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const THEMES = {
  dark: {
    ground: '#0f0f0f',
    card: '#1a1a1a',
    ink: '#fafafa',
    soft: '#d4d4d4',
    muted: '#a1a1a1',
    line: '#2a2a2a',
    brand: '#51a2ff',
    wordmarkFile: 'Composio Logo Dark.svg',
    logoTheme: 'dark',
    backgroundFile: 'og/bg-dark.jpg' as string | null,
  },
  light: {
    ground: '#fbfbfb',
    card: '#ffffff',
    ink: '#0f0f0f',
    soft: '#3d3d3d',
    muted: '#6b6b6b',
    line: '#e5e5e5',
    brand: '#0007cd',
    wordmarkFile: 'Composio Logo.svg',
    logoTheme: null,
    backgroundFile: null as string | null,
  },
} as const;
export type OgTheme = keyof typeof THEMES;
type Palette = (typeof THEMES)[OgTheme];

const SECTIONS = ['docs', 'toolkits', 'reference', 'changelog', 'home'] as const;
export type OgSection = (typeof SECTIONS)[number];

const SECTION_LABELS: Record<OgSection, string> = {
  docs: 'Docs',
  toolkits: 'Toolkits',
  reference: 'API Reference',
  changelog: 'Changelog',
  home: 'Docs',
};

const LOGO_HOSTS = new Set(['logos.composio.dev', 'assets.composio.dev']);

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 200;

// --- assets -----------------------------------------------------------------

// Resolved per call, not at import time, so the app root is whatever cwd is
// when the first request lands (matches lib/toolkit-data.ts).
const fontsDir = () => join(process.cwd(), 'app/fonts');
const publicDir = () => join(process.cwd(), 'public');

type FontSpec = { name: string; data: ArrayBuffer; weight: 400 | 500; style: 'normal' };

async function loadFont(file: string, name: string, weight: 400 | 500): Promise<FontSpec | null> {
  try {
    const buf = await readFile(join(fontsDir(), file));
    return { name, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), weight, style: 'normal' };
  } catch {
    return null;
  }
}

let fontsPromise: Promise<FontSpec[]> | null = null;
function getFonts(): Promise<FontSpec[]> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      loadFont('Geist-Regular.ttf', 'Geist', 400),
      loadFont('Geist-Medium.ttf', 'Geist', 500),
      loadFont('GeistMono-Regular.ttf', 'Geist Mono', 400),
      loadFont('GeistMono-Medium.ttf', 'Geist Mono', 500),
    ]).then((fonts) => fonts.filter((f): f is FontSpec => f !== null));
  }
  return fontsPromise;
}

interface Brand {
  /** Full wordmark as a data URI. */
  wordmark: string | null;
  /** Icon glyph only, as a data URI. */
  mark: string | null;
  /** Full-bleed background as a data URI, when the theme has one. */
  background: string | null;
}

const toDataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const brandPromises: Partial<Record<OgTheme, Promise<Brand>>> = {};
function getBrand(theme: OgTheme): Promise<Brand> {
  let promise = brandPromises[theme];
  if (!promise) {
    const { wordmarkFile, backgroundFile } = THEMES[theme];
    const background = backgroundFile
      ? readFile(join(publicDir(), backgroundFile))
          .then((buf) => `data:image/jpeg;base64,${buf.toString('base64')}`)
          .catch(() => null)
      : Promise.resolve(null);
    promise = Promise.all([readFile(join(publicDir(), wordmarkFile), 'utf8').catch(() => null), background])
      .then(([svg, background]) => {
        if (!svg) return { wordmark: null, mark: null, background };
        // The first two <path>s of the wordmark are the icon glyph; the rest are letterforms.
        const paths = svg.match(/<path[^>]*\/>/g)?.slice(0, 2) ?? [];
        const mark = paths.length === 2
          ? toDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 121" fill="none">${paths.join('')}</svg>`)
          : null;
        return { wordmark: toDataUri(svg), mark, background };
      });
    brandPromises[theme] = promise;
  }
  return promise;
}

// --- params -----------------------------------------------------------------

export interface OgParams {
  section: OgSection;
  theme: OgTheme;
  title: string;
  description: string;
  logo: string | null;
  date: string | null;
  version: string | null;
}

function clip(value: string | null, max: number): string {
  return Array.from((value ?? '').trim()).slice(0, max).join('');
}

function safeLogo(value: string | null, theme: OgTheme): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !LOGO_HOSTS.has(url.hostname)) return null;
    const logoTheme = THEMES[theme].logoTheme;
    if (logoTheme) url.searchParams.set('theme', logoTheme);
    return url.toString();
  } catch {
    return null;
  }
}

export function parseOgParams(request: Request): OgParams {
  const params = new URL(request.url).searchParams;
  const rawSection = params.get('section') ?? (params.get('variant') === 'home' ? 'home' : 'docs');
  const section = (SECTIONS as readonly string[]).includes(rawSection) ? (rawSection as OgSection) : 'docs';
  const theme: OgTheme = params.get('theme') === 'light' ? 'light' : 'dark';
  const title = clip(params.get('title'), TITLE_MAX) || (section === 'home' ? '' : 'Composio Docs');
  return {
    section,
    theme,
    title,
    description: clip(params.get('description'), DESCRIPTION_MAX),
    logo: safeLogo(params.get('logo'), theme),
    date: clip(params.get('date'), 40) || null,
    version: clip(params.get('version'), 12) || null,
  };
}

// --- primitives -------------------------------------------------------------

const sans = 'Geist, ui-sans-serif, system-ui, sans-serif';
const mono = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

interface Ctx {
  c: Palette;
  brand: Brand;
}

function Stack({ children, gap = 24 }: { children: React.ReactNode; gap?: number }) {
  // Satori flattens fragments into the parent's flex row, so every card
  // slot wraps its pieces in an explicit column.
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap }}>{children}</div>;
}

function Eyebrow({ children, color }: { children: string; color: string }) {
  return (
    <div style={{ display: 'flex', fontFamily: mono, fontSize: 20, fontWeight: 500, letterSpacing: 2.4, textTransform: 'uppercase', color }}>
      {children}
    </div>
  );
}

function Chip({ children, c }: { children: string; c: Palette }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '8px 14px',
      border: `1px solid ${c.line}`, background: c.card,
      fontFamily: mono, fontSize: 18, letterSpacing: 1.2, textTransform: 'uppercase', color: c.muted,
    }}>
      {children}
    </div>
  );
}

function Title({ children, size, c }: { children: string; size: number; c: Palette }) {
  return (
    <div style={{
      display: 'flex', fontFamily: sans, fontWeight: 500, fontSize: size, lineHeight: 1.08,
      letterSpacing: size >= 60 ? -2 : -1.2, color: c.ink, maxWidth: 1000, lineClamp: 3,
      justifyContent: 'center', textAlign: 'center', textWrap: 'balance',
    }}>
      {children}
    </div>
  );
}

function titleSize(title: string, base = 72): number {
  const n = title.length;
  if (n > 90) return base - 28;
  if (n > 60) return base - 16;
  if (n > 36) return base - 8;
  return base;
}

function Description({ children, c }: { children: string; c: Palette }) {
  if (!children) return null;
  return (
    <div style={{
      display: 'flex', fontFamily: sans, fontSize: 30, lineHeight: 1.4, color: c.soft, maxWidth: 900, lineClamp: 2,
      justifyContent: 'center', textAlign: 'center', textWrap: 'balance',
    }}>
      {children}
    </div>
  );
}

function Node({ children, c }: { children: React.ReactNode; c: Palette }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 112, height: 112, background: c.card, border: `1px solid ${c.line}`,
    }}>
      {children}
    </div>
  );
}

// --- shell ------------------------------------------------------------------

function Shell({ ctx, label, children }: { ctx: Ctx; label: string; children: React.ReactNode }) {
  const { c, brand } = ctx;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      width: '100%', height: '100%', padding: '56px 64px',
      background: c.ground, color: c.ink, fontFamily: sans, position: 'relative',
    }}>
      {brand.background ? (
        <img src={brand.background} width={OG_WIDTH} height={OG_HEIGHT} alt=""
          style={{ position: 'absolute', top: 0, left: 0, width: OG_WIDTH, height: OG_HEIGHT, opacity: 0.7 }} />
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {brand.wordmark ? (
          <img src={brand.wordmark} width={165} height={30} alt="" />
        ) : (
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 500 }}>Composio</div>
        )}
        <Eyebrow color={c.brand}>{label}</Eyebrow>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 24, flexGrow: 1,
        justifyContent: 'center', alignItems: 'center', textAlign: 'center', paddingTop: 24,
      }}>
        {children}
      </div>
    </div>
  );
}

// --- section slots ----------------------------------------------------------

type CardProps = { p: OgParams; ctx: Ctx };

function DocsCard({ p, ctx: { c } }: CardProps) {
  return (
    <Stack>
      <Title size={titleSize(p.title)} c={c}>{p.title}</Title>
      <Description c={c}>{p.description}</Description>
    </Stack>
  );
}

function ToolkitCard({ p, ctx: { c, brand } }: CardProps) {
  const name = p.title.replace(/\s*-\s*Composio Toolkit\s*$/i, '');
  return (
    <Stack>
      {p.logo ? (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <Node c={c}>
            {brand.mark ? <img src={brand.mark} width={56} height={65} alt="" /> : <div style={{ display: 'flex', fontSize: 40, fontWeight: 500 }}>C</div>}
          </Node>
          <div style={{ display: 'flex', width: 72, height: 4, background: c.muted }} />
          <Node c={c}>
            <img src={p.logo} width={72} height={72} alt="" style={{ objectFit: 'contain' }} />
          </Node>
        </div>
      ) : null}
      <Title size={titleSize(`${name} Toolkit`, 64)} c={c}>{`${name} Toolkit`}</Title>
      <Description c={c}>{p.description || `Connect your AI agent to ${name} with Composio.`}</Description>
    </Stack>
  );
}

function ReferenceCard({ p, ctx: { c } }: CardProps) {
  return (
    <Stack>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
        <div style={{
          display: 'flex', alignItems: 'center', padding: '8px 14px',
          background: c.brand, color: c.ground,
          fontFamily: mono, fontSize: 18, fontWeight: 500, letterSpacing: 1.2,
        }}>
          REST API
        </div>
        {p.version ? <Chip c={c}>{p.version}</Chip> : null}
      </div>
      <Title size={titleSize(p.title)} c={c}>{p.title}</Title>
      <Description c={c}>{p.description}</Description>
    </Stack>
  );
}

function ChangelogCard({ p, ctx: { c } }: CardProps) {
  return (
    <Stack>
      {p.date ? <Eyebrow color={c.muted}>{p.date}</Eyebrow> : null}
      <Title size={titleSize(p.title)} c={c}>{p.title}</Title>
      {/* The page description is "Updates from <date>", which the eyebrow already says. */}
      {p.date ? null : <Description c={c}>{p.description}</Description>}
    </Stack>
  );
}

function HomeCard({ p, ctx: { c } }: CardProps) {
  return (
    <Stack>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        fontFamily: sans, fontWeight: 500, fontSize: 84, lineHeight: 1.02, letterSpacing: -3, color: c.ink,
      }}>
        <span>Build and operate</span>
        <span style={{ color: c.brand }}>AI agents.</span>
      </div>
      <Description c={c}>{p.description || 'Tools, managed authentication, and secure execution for your agents.'}</Description>
    </Stack>
  );
}

const CARDS: Record<OgSection, (props: CardProps) => React.ReactElement> = {
  docs: DocsCard,
  toolkits: ToolkitCard,
  reference: ReferenceCard,
  changelog: ChangelogCard,
  home: HomeCard,
};

// --- handler ----------------------------------------------------------------

export async function GET(request: Request) {
  const p = parseOgParams(request);
  const [fonts, brand] = await Promise.all([getFonts(), getBrand(p.theme)]);
  const ctx: Ctx = { c: THEMES[p.theme], brand };
  const Card = CARDS[p.section];

  return new ImageResponse(
    <Shell ctx={ctx} label={SECTION_LABELS[p.section]}>
      <Card p={p} ctx={ctx} />
    </Shell>,
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts,
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
    },
  );
}
