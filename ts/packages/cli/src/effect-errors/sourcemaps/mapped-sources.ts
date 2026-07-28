import { Data } from 'effect';

import type { ErrorLocation } from './get-error-location-from-file-path';
import type { SourceCode } from './get-source-code';

export type MaybeMappedSources = Data.TaggedEnum<{
  sources: {
    readonly name: string;
    readonly source: SourceCode[];
    readonly runPath: string;
    readonly sourcesPath: string | undefined;
  };
  location: ErrorLocation & {
    readonly name: string;
  };
  'stack-entry': {
    readonly runPath: string;
  };
}>;

export const MappedSources = Data.taggedEnum<MaybeMappedSources>();

export type ErrorRelatedSources = Data.TaggedEnum.Value<MaybeMappedSources, 'sources'>;
export type RawErrorLocation = Data.TaggedEnum.Value<MaybeMappedSources, 'location'>;
export type StackEntry = Data.TaggedEnum.Value<MaybeMappedSources, 'stack-entry'>;

export const isErrorRelatedSources = MappedSources.$is('sources');
export const isRawErrorLocation = MappedSources.$is('location');
