#!/usr/bin/env bun

import process from 'node:process';
import { Effect } from 'effect';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { copyLocalToolBinaryAssets, teardown } from './_shared';

const outputDir = process.argv[2] ?? './dist';

copyLocalToolBinaryAssets(outputDir).pipe(
  Effect.provide(BunContext.layer),
  Effect.scoped,
  BunRuntime.runMain({ teardown })
);
