#!/usr/bin/env bun

/**
 * Generate a Markdown table comparing API metrics before and after an optimization PR.
 *
 * Usage:
 *   pnpm run metrics
 */

interface Metric {
  requests: number;
  megabytes: number;
}

interface MetricRow {
  name: string;
  before: Metric;
  after: Metric;
}

const data: MetricRow[] = [
  {
    name: 'Default',
    before: { requests: 4, megabytes: 1.71 },
    after: { requests: 3, megabytes: 1.7 },
  },
  {
    name: '`--type-tools`',
    before: { requests: 26, megabytes: 111.3 },
    after: { requests: 24, megabytes: 110.62 },
  },
  {
    name: '`--toolkits entelligence`',
    before: { requests: 5, megabytes: 2.35 },
    after: { requests: 3, megabytes: 718.68 / 1024 }, // Convert KB to MB
  },
  {
    name: '`--type-tools` + `--toolkits entelligence`',
    before: { requests: 27, megabytes: 111.94 },
    after: { requests: 3, megabytes: 6.21 / 1024 }, // Convert KB to MB
  },
];

function percentChange(before: number, after: number): string {
  let change = ((after - before) / before) * 100;
  // Cap at -99.9% unless it's truly 0
  if (after > 0 && change < -99.9) {
    change = -99.9;
  }
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

function formatMB(mb: number): string {
  if (mb < 1) {
    return `${(mb * 1024).toFixed(2)} KB`;
  }
  return `${mb.toFixed(2)} MB`;
}

function generateMarkdownTable(rows: MetricRow[]): string {
  const lines: string[] = [];

  lines.push('# Metrics Comparison: Before vs After Optimization');
  lines.push('');
  lines.push(
    '| Case | Requests (Before) | Requests (After) | Requests Δ | Downloaded (Before) | Downloaded (After) | Downloaded Δ |'
  );
  lines.push(
    '|------|-------------------|------------------|------------|---------------------|--------------------|--------------| '
  );

  for (const row of rows) {
    const reqChange = percentChange(row.before.requests, row.after.requests);
    const mbChange = percentChange(row.before.megabytes, row.after.megabytes);

    lines.push(
      `| ${row.name} | ${row.before.requests} | ${row.after.requests} | ${reqChange} | ${formatMB(row.before.megabytes)} | ${formatMB(row.after.megabytes)} | ${mbChange} |`
    );
  }

  return lines.join('\n');
}

const table = generateMarkdownTable(data);
console.log(table);
