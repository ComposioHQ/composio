import 'dotenv/config';

// Set before importing SDKs: debug logging can expose requests and mailbox output.
process.env.COMPOSIO_LOG_LEVEL = 'silent';
process.env.OPENAI_LOG = 'off';

const argv = process.argv.slice(2);
if (argv[0] === '--') argv.shift();
const attackDemo = argv.length === 1 && argv[0] === '--attack-demo';
const required = ['COMPOSIO_API_KEY', 'COMPOSIO_EXAMPLES_USER_ID', 'TYPESAFE_API_KEY'];
if (!attackDemo) required.push('OPENAI_API_KEY');
const missing = required.filter(name => !process.env[name]?.trim());

if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}. See .env.example.`);
  process.exitCode = 1;
} else if (!attackDemo && (argv.length !== 1 || !argv[0].trim())) {
  console.error('Usage: pnpm start -- "Find my unread emails from GitHub"');
  process.exitCode = 1;
} else {
  const { run } = await import('./agent');
  await run(attackDemo ? undefined : argv[0]).catch(() => {
    // Never print vendor errors: they can contain arguments or mailbox contents.
    console.error('Request failed. Check API configuration and the active Gmail connection.');
    process.exitCode = 1;
  });
}
