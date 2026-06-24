// Inline app logos used in the daily-standup-bot example page intro.

const LOGO_CDN = 'https://logos.composio.dev/api';

/** A small inline app logo (e.g. <AppLogo slug="github" />) from the Composio
 *  logo CDN, sized to fit the text line. The CDN serves fixed-colour SVGs, so
 *  pass `invert` for monochrome marks (GitHub) that would vanish on the dark
 *  theme; leave full-colour logos (Slack) bare. */
export function AppLogo({ slug, alt, invert }: { slug: string; alt?: string; invert?: boolean }) {
  return (
    <img
      src={`${LOGO_CDN}/${slug}`}
      alt={alt ?? slug}
      width={16}
      height={16}
      className={invert ? 'inline-block dark:invert' : 'inline-block'}
      style={{ height: '1em', width: '1em', verticalAlign: '-0.18em', margin: '0 0.12em' }}
    />
  );
}
