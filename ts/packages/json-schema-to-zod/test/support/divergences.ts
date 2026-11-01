import { it } from 'vitest';

import type { Builder } from './builders';

/**
 * Cases one builder is known to get wrong. Each entry turns the named case
 * into a test that must keep failing for that builder, so a fix shows up as
 * a failing suite and the entry is removed. The target is an empty list.
 */
export type Divergence = {
  readonly builder: Builder['name'];
  /** The test name as the suite registers it. */
  readonly case: string;
  readonly reason: string;
};

export const divergences: ReadonlyArray<Divergence> = [];

const isDivergent = (builder: Builder, caseName: string): boolean =>
  divergences.some(entry => entry.builder === builder.name && entry.case === caseName);

/** `it`, or `it.fails` for a case the builder is listed as diverging on. */
export const testFor = (builder: Builder, caseName: string): typeof it | typeof it.fails =>
  isDivergent(builder, caseName) ? it.fails : it;
