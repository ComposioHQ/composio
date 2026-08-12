import { Option, Schema } from 'effect';

/**
 * Tolerant normalization of trigger-log API payloads.
 *
 * The `@composio/client` type (`Logs.TriggerListResponse.Data`) declares
 * trigger metadata under `meta` in camelCase, but the API has historically
 * served camelCase and snake_case variants at both the top level and under
 * `meta`. Instead of mining those aliases with `as ... as Record` casts at
 * every call site, payloads are decoded once at the API boundary into the
 * canonical {@link TriggerLogRecord} shape.
 *
 * Decoding is deliberately lenient: wrongly-typed fields behave as absent and
 * a completely garbage payload decodes to an empty record, so formatting
 * falls back to `'-'` placeholders instead of failing the command.
 */

/** Decodes to the string value when present, treating any other type as absent. */
const LenientString = Schema.transform(Schema.Unknown, Schema.UndefinedOr(Schema.String), {
  strict: true,
  decode: value => (typeof value === 'string' ? value : undefined),
  encode: value => value,
});

/** Decodes to the string or number value when present, treating any other type as absent. */
const LenientTimestamp = Schema.transform(
  Schema.Unknown,
  Schema.UndefinedOr(Schema.Union(Schema.String, Schema.Number)),
  {
    strict: true,
    decode: value => (typeof value === 'string' || typeof value === 'number' ? value : undefined),
    encode: value => value,
  }
);

/**
 * Every alias the CLI has ever mined from trigger logs. The same aliases can
 * appear at the top level of a record and under its `meta` object.
 */
const aliasFields = {
  id: Schema.optional(LenientString),
  logId: Schema.optional(LenientString),
  log_id: Schema.optional(LenientString),
  triggerId: Schema.optional(LenientString),
  trigger_id: Schema.optional(LenientString),
  triggerNanoId: Schema.optional(LenientString),
  trigger_nano_id: Schema.optional(LenientString),
  triggerName: Schema.optional(LenientString),
  trigger_name: Schema.optional(LenientString),
  status: Schema.optional(LenientString),
  appName: Schema.optional(LenientString),
  toolkit: Schema.optional(LenientString),
  toolkit_key: Schema.optional(LenientString),
  connectionId: Schema.optional(LenientString),
  connection_id: Schema.optional(LenientString),
  connectedAccountId: Schema.optional(LenientString),
  entityId: Schema.optional(LenientString),
  entity_id: Schema.optional(LenientString),
  userId: Schema.optional(LenientString),
  createdAt: Schema.optional(LenientTimestamp),
  created_at: Schema.optional(LenientTimestamp),
};

const RawTriggerLogMeta = Schema.Struct({
  ...aliasFields,
  triggerProviderPayload: Schema.optional(Schema.Unknown),
  triggerClientPayload: Schema.optional(Schema.Unknown),
  triggerClientResponse: Schema.optional(Schema.Unknown),
  triggerProviderResponse: Schema.optional(Schema.Unknown),
});
type RawTriggerLogMeta = typeof RawTriggerLogMeta.Type;

const decodeMetaOption = Schema.decodeUnknownOption(RawTriggerLogMeta);

/** Any non-record `meta` behaves like an absent one. */
const LenientMeta = Schema.transform(
  Schema.Unknown,
  Schema.UndefinedOr(Schema.typeSchema(RawTriggerLogMeta)),
  {
    strict: true,
    decode: value => Option.getOrUndefined(decodeMetaOption(value)),
    encode: value => value,
  }
);

const rawLevelFields = {
  ...aliasFields,
  payloadReceived: Schema.optional(Schema.Unknown),
  payload: Schema.optional(Schema.Unknown),
  response: Schema.optional(Schema.Unknown),
  meta: Schema.optional(LenientMeta),
};

const RawTriggerLogLevel = Schema.Struct(rawLevelFields);
type RawTriggerLogLevel = typeof RawTriggerLogLevel.Type;

const decodeLevelOption = Schema.decodeUnknownOption(RawTriggerLogLevel);

/**
 * `logs.triggers.retrieve` responses wrap the record under `log`. Any object
 * there is used as the record (even one that yields no fields); everything
 * else falls back to the top level.
 */
const LenientNestedLog = Schema.transform(
  Schema.Unknown,
  Schema.UndefinedOr(Schema.typeSchema(RawTriggerLogLevel)),
  {
    strict: true,
    decode: value =>
      typeof value === 'object' && value !== null
        ? Option.getOrElse(decodeLevelOption(value), (): RawTriggerLogLevel => ({}))
        : undefined,
    encode: value => value,
  }
);

const RawTriggerLog = Schema.Struct({
  ...rawLevelFields,
  log: Schema.optional(LenientNestedLog),
});

/**
 * Canonical trigger-log shape consumed by the `logs triggers` formatting code.
 *
 * - Top-level fields hold the values exactly as the client type declares them
 *   (the plain list-table columns).
 * - `detail` holds alias-resolved fields for the info block. Precedence: the
 *   listed aliases at the top level of the record first, then the same
 *   aliases under `meta`.
 * - `table` holds the trigger columns of the list table, which historically
 *   resolved `meta` aliases first (nano id preferred over plain id) and only
 *   then the top level.
 */
export const TriggerLogRecord = Schema.Struct({
  id: Schema.optional(Schema.String),
  appName: Schema.optional(Schema.String),
  entityId: Schema.optional(Schema.String),
  connectionId: Schema.optional(Schema.String),
  createdAt: Schema.optional(Schema.Union(Schema.String, Schema.Number)),
  detail: Schema.Struct({
    /** `id` → `logId` → `log_id`, top level then `meta`. */
    logId: Schema.optional(Schema.String),
    /** `triggerId` → `trigger_id`, top level then `meta`. */
    triggerId: Schema.optional(Schema.String),
    /** `triggerNanoId` → `trigger_nano_id`, top level then `meta`. */
    triggerNanoId: Schema.optional(Schema.String),
    /** `triggerName` → `trigger_name`, top level then `meta`. */
    triggerName: Schema.optional(Schema.String),
    /** `status`, top level then `meta`. */
    status: Schema.optional(Schema.String),
    /** `appName` → `toolkit` → `toolkit_key`, top level then `meta`. */
    toolkit: Schema.optional(Schema.String),
    /** `connectionId` → `connection_id` → `connectedAccountId`, top level then `meta`. */
    connectionId: Schema.optional(Schema.String),
    /** `entityId` → `entity_id` → `userId`, top level then `meta`. */
    entityId: Schema.optional(Schema.String),
    /** `createdAt` → `created_at`, top level then `meta`. */
    createdAt: Schema.optional(Schema.Union(Schema.String, Schema.Number)),
  }),
  table: Schema.Struct({
    /** Nano id preferred over plain id; `meta` aliases before top-level ones. */
    triggerId: Schema.optional(Schema.String),
    /** `triggerName` → `trigger_name`, `meta` then top level. */
    triggerName: Schema.optional(Schema.String),
  }),
  /**
   * `meta.triggerProviderPayload` → `meta.triggerClientPayload` →
   * `payloadReceived` → `payload` → `null`, JSON-parsed when it looks like JSON.
   */
  payload: Schema.Unknown,
  /**
   * `meta.triggerClientResponse` → `meta.triggerProviderResponse` →
   * `response` → `null`, JSON-parsed when it looks like JSON.
   */
  response: Schema.Unknown,
});
export type TriggerLogRecord = typeof TriggerLogRecord.Type;

/** Parses strings that look like JSON objects/arrays, passing everything else through. */
export const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return Option.getOrElse(
      Option.liftThrowable((input: string): unknown => JSON.parse(input))(trimmed),
      () => value
    );
  }
  return value;
};

const normalizeLevel = (level: RawTriggerLogLevel): TriggerLogRecord => {
  const meta = level.meta;

  return {
    id: level.id,
    appName: level.appName,
    entityId: level.entityId,
    connectionId: level.connectionId,
    createdAt: level.createdAt,
    detail: {
      logId: level.id ?? level.logId ?? level.log_id ?? meta?.id ?? meta?.logId ?? meta?.log_id,
      triggerId: level.triggerId ?? level.trigger_id ?? meta?.triggerId ?? meta?.trigger_id,
      triggerNanoId:
        level.triggerNanoId ??
        level.trigger_nano_id ??
        meta?.triggerNanoId ??
        meta?.trigger_nano_id,
      triggerName:
        level.triggerName ?? level.trigger_name ?? meta?.triggerName ?? meta?.trigger_name,
      status: level.status ?? meta?.status,
      toolkit:
        level.appName ??
        level.toolkit ??
        level.toolkit_key ??
        meta?.appName ??
        meta?.toolkit ??
        meta?.toolkit_key,
      connectionId:
        level.connectionId ??
        level.connection_id ??
        level.connectedAccountId ??
        meta?.connectionId ??
        meta?.connection_id ??
        meta?.connectedAccountId,
      entityId:
        level.entityId ??
        level.entity_id ??
        level.userId ??
        meta?.entityId ??
        meta?.entity_id ??
        meta?.userId,
      createdAt: level.createdAt ?? level.created_at ?? meta?.createdAt ?? meta?.created_at,
    },
    table: {
      triggerId:
        meta?.triggerNanoId ??
        meta?.trigger_nano_id ??
        meta?.triggerId ??
        meta?.trigger_id ??
        level.triggerNanoId ??
        level.trigger_nano_id ??
        level.triggerId ??
        level.trigger_id,
      triggerName:
        meta?.triggerName ?? meta?.trigger_name ?? level.triggerName ?? level.trigger_name,
    },
    payload: parseMaybeJson(
      meta?.triggerProviderPayload ??
        meta?.triggerClientPayload ??
        level.payloadReceived ??
        level.payload ??
        null
    ),
    response: parseMaybeJson(
      meta?.triggerClientResponse ?? meta?.triggerProviderResponse ?? level.response ?? null
    ),
  };
};

const TriggerLogRecordFromRaw = Schema.transform(RawTriggerLog, TriggerLogRecord, {
  strict: true,
  decode: raw => normalizeLevel(raw.log ?? raw),
  encode: record => ({
    id: record.id,
    appName: record.appName,
    entityId: record.entityId,
    connectionId: record.connectionId,
    createdAt: record.createdAt,
    logId: record.detail.logId,
    triggerId: record.detail.triggerId,
    triggerNanoId: record.detail.triggerNanoId,
    triggerName: record.detail.triggerName,
    status: record.detail.status,
    toolkit: record.detail.toolkit,
    payload: record.payload,
    response: record.response,
  }),
});

const decodeTriggerLogRecordOption = Schema.decodeUnknownOption(TriggerLogRecordFromRaw);

/** Canonical record produced when a payload cannot be decoded at all. */
export const emptyTriggerLogRecord: TriggerLogRecord = normalizeLevel({});

/**
 * Decodes an unknown trigger-log payload into the canonical
 * {@link TriggerLogRecord}, falling back to {@link emptyTriggerLogRecord}
 * (which formats as `'-'` placeholders) when the payload is not an object.
 */
export const decodeTriggerLogRecord = (input: unknown): TriggerLogRecord =>
  Option.getOrElse(decodeTriggerLogRecordOption(input), () => emptyTriggerLogRecord);
