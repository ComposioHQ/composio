import { ErrorLogPayload, ErrorLogPayloadSchema } from '../types/errors.types';

const getLogTags = (errorData: ErrorLogPayload) => {
  const { source, metadata } = errorData;
  return [
    ...(source?.name ? [`source:${source.name}`] : []),
    ...(source?.service ? [`service:${source.service}`] : []),
    ...(source?.language ? [`language:${source.language}`] : []),
    ...(source?.version ? [`version:${source.version}`] : []),
    ...(source?.platform ? [`platform:${source.platform}`] : []),
    ...(metadata?.projectId ? [`project_id:${metadata.projectId}`] : []),
    ...(metadata?.provider ? [`provider:${metadata.provider}`] : []),
    'status:error',
    'level:error',
  ]
    .filter(Boolean)
    .join(',');
};

const getLogHost = (errorData: ErrorLogPayload) => {
  const { source } = errorData;
  return `composio-${source?.service}-${source?.language}`;
};

export const createErrorLogPayload = (errorData: ErrorLogPayload) => {
  const logBody = {
    message: errorData.message,
    ddtags: getLogTags(errorData),
    hostname: getLogHost(errorData),
    service: getLogHost(errorData),
  };
  return logBody;
};

export async function sendErrorLogToDatadog(errorData: ErrorLogPayload, datadogApiKey: string) {
  const parsedPayload = ErrorLogPayloadSchema.safeParse(errorData);
  if (parsedPayload.error) {
    throw parsedPayload.error;
  }

  const logBody = createErrorLogPayload(parsedPayload.data);

  const res = await fetch('https://api.datadoghq.com/api/v1/series', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': datadogApiKey,
    },
    body: JSON.stringify(logBody),
  });

  if (!res.ok) {
    console.error('Failed to send error log to Datadog:', await res.text());
  }

  return res.ok;
}
