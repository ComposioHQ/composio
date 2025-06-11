import {
  DDMetricPayload,
  DDMetricPayloadSchema,
  TelemetryMetricPayload,
  TelemetryMetricPayloadSchema,
} from '../types/metrics.types';

const getMetricName = (
  type: 'function_invocation' | 'function_duration',
  payload: TelemetryMetricPayload
) => {
  const { functionName, source } = payload;
  if (source?.service === 'sdk') {
    return `composio.${source.service}.${type}`;
  }
  return `composio.sdk.${type}`;
};

const getMetricTags = (payload: TelemetryMetricPayload) => {
  const { functionName, source, metadata, error } = payload;
  return [
    `function:${functionName}`,
    ...(source?.name ? [`source:${source.name}`] : []),
    ...(source?.service ? [`service:${source.service}`] : []),
    ...(source?.language ? [`language:${source.language}`] : []),
    ...(source?.version ? [`version:${source.version}`] : []),
    ...(source?.platform ? [`platform:${source.platform}`] : []),
    ...(metadata?.projectId ? [`project_id:${metadata.projectId}`] : []),
    ...(metadata?.provider ? [`provider:${metadata.provider}`] : []),
    ...(error ? ['status:error'] : ['status:success']),
  ];
};

const getMetricHost = (payload: TelemetryMetricPayload) => {
  const { source } = payload;
  return `composio-${source?.service}-${source?.language}`;
};

const createDDMetricPayload = (
  type: 'count' | 'gauge',
  payload: TelemetryMetricPayload
): DDMetricPayload => {
  const { durationMs, timestamp } = payload;
  const executionTimestamp = timestamp ?? Math.floor(Date.now() / 1000);
  const executionDuration = durationMs ?? 1;

  const parsedPayload = DDMetricPayloadSchema.safeParse({
    host: getMetricHost(payload),
    metric: getMetricName('function_invocation', payload),
    points: [[executionTimestamp, executionDuration]],
    tags: getMetricTags(payload),
    type,
  });

  if (parsedPayload.error) {
    throw parsedPayload.error;
  }

  return parsedPayload.data;
};

/**
 * Creates a metric payload for Datadog.
 *
 * @description This function creates a metric payload for Datadog. It returns an array of two
 * objects, one for the count metric and one for the duration metric.
 *
 * @param payload - The payload to create a metric for.
 * @returns An array of two objects, one for the count metric and one for the duration metric.
 */
export const createMetricPayload = (payload: TelemetryMetricPayload): Array<DDMetricPayload> => {
  const parsedPayload = TelemetryMetricPayloadSchema.safeParse(payload);
  if (parsedPayload.error) {
    throw parsedPayload.error;
  }

  const DDMetricCountPayload = createDDMetricPayload('count', payload);
  const DDMetricDurationPayload = createDDMetricPayload('gauge', payload);

  return [DDMetricCountPayload, DDMetricDurationPayload];
};

export const sendMetricToDatadog = async (
  payload: Array<TelemetryMetricPayload>,
  datadogApiKey: string
) => {
  const parsedPayload = payload.map(item => createMetricPayload(item)).flat();
  console.log(JSON.stringify(parsedPayload, null, 2));
  const res = await fetch('https://api.datadoghq.com/api/v1/series', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': datadogApiKey,
    },
    body: JSON.stringify({
      series: parsedPayload,
    }),
  });

  if (!res.ok) {
    console.error('Failed to send metric payload to Datadog:', await res.text());
  }

  return res.ok;
};
