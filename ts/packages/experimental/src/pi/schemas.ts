import type { Tool as ComposioTool } from '@composio/core';
import { Type, type TSchema } from 'typebox';

const EmptyObjectSchema = Type.Object({});

export const ToolkitsSchema = Type.Optional(
  Type.Array(Type.String({ description: 'Optional toolkit slug filter, e.g. github, gmail.' }))
);

export const objectInputSchema = (schema: ComposioTool['inputParameters'] | undefined): TSchema => {
  const candidate =
    schema && typeof schema === 'object'
      ? ({ ...schema } as Record<string, unknown>)
      : ({ ...EmptyObjectSchema } as Record<string, unknown>);
  if (!candidate.type) candidate.type = 'object';
  if (!candidate.properties) candidate.properties = {};
  if (candidate.additionalProperties === undefined) candidate.additionalProperties = true;
  return Type.Unsafe(candidate);
};

export const optionalRecordSchema = (description: string) =>
  Type.Optional(Type.Record(Type.String(), Type.Any(), { description }));
