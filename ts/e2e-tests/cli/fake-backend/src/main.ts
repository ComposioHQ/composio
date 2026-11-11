/**
 * Runs the fake backend on its own, for poking at the CLI by hand:
 *
 *   bun ts/e2e-tests/cli/fake-backend/src/main.ts
 *
 * Prints the environment to give the binary and logs each request it receives.
 * Pass a path to also write the Dashboard certificate there, for
 * `NODE_EXTRA_CA_CERTS`.
 */

import { writeFileSync } from 'node:fs';
import { startFakeComposio } from './server';

const fake = await startFakeComposio();
const certificatePath = process.argv[2];
if (certificatePath) writeFileSync(certificatePath, fake.caCert);
console.log(
  Object.entries(fake.cliEnv())
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')
);

let seen = 0;
setInterval(() => {
  for (const entry of fake.journal.since(seen)) {
    console.log(
      JSON.stringify({
        role: entry.role,
        request: `${entry.method} ${entry.path}`,
        query: entry.query,
        route: entry.route,
        key: entry.keyClass,
        org: entry.orgId,
        project: entry.project,
        via: entry.projectFrom,
        user: entry.userId,
        status: entry.status,
        body: entry.body,
      })
    );
  }
  seen = fake.journal.mark();
}, 100);
