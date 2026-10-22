import toolkitsData from '@/public/data/toolkits-list.json';

// Server-only: reads the full toolkit catalog at build time to derive a
// rounded-down, human-friendly count for marketing copy (hero, metadata,
// llms.txt). Never import this from a "use client" module — that would ship
// the ~1,300-row JSON array to the browser just to read its length.
const roundedToolkitCount = Math.floor(toolkitsData.length / 100) * 100;

// Pin the locale so the grouping separator is a comma regardless of the build
// host's locale ("1,300+", never "1.300+" or "1 300+").
export const TOOLKIT_COUNT_LABEL = `${roundedToolkitCount.toLocaleString('en-US')}+`;

// Copy for the docs homepage social card. Counts apps rather than tools so
// it matches the landing page. Every route that builds the home-card URL
// uses this, so the live count survives whichever page sets the metadata.
export const HOME_OG_DESCRIPTION = `Build AI agents with ${TOOLKIT_COUNT_LABEL} apps. Connect LLMs to external services like GitHub, Slack, Gmail, and more.`;
