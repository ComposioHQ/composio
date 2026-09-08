import { generateKbContent } from '@/lib/kb/generate';

const summary = generateKbContent({ check: process.argv.includes('--check') });
console.log(
  `KB content ready: ${summary.published} published, ${summary.held} held, ${summary.files} generated files.`,
);
