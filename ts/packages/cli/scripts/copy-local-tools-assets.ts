#!/usr/bin/env bun

import process from 'node:process';
import { Effect } from 'effect';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { copyLocalToolBinaryAssets, teardown } from './_shared';

const outputDir = process.argv[2] ?? './dist';

copyLocalToolBinaryAssets(outputDir).pipe(
  Effect.provide(BunServices.layer),
  Effect.scoped,
  BunRuntime.runMain({ teardown })
);
