import { z } from "zod";

export const ZAuthMode = z.enum([
  "OAUTH2",
  "OAUTH1",
  "OAUTH1A",
  "API_KEY",
  "BASIC",
  "BEARER_TOKEN",
  "GOOGLE_SERVICE_ACCOUNT",
  "NO_AUTH",
  "BASIC_WITH_JWT",
]);

export const ZCreateIntegrationParams = z.object({
  name: z.string(),
  authScheme: ZAuthMode.optional(),
  appId: z.string(),
  forceNewIntegration: z.boolean().optional(),
  authConfig: z
    .union([
      z.record(z.unknown()),
      z.object({
        client_id: z.string(),
        client_secret: z.string(),
        api_key: z.string(),
        consumer_key: z.string(),
        consumer_secret: z.string(),
        base_url: z.string(),
      }),
    ])
    .optional(),
  useComposioAuth: z.boolean().optional(),
});

export const ZSingleIntegrationParams = z.object({
  integrationId: z.string(),
});

export const ZListIntegrationsParams = z.object({
  page: z.number().optional(),
  pageSize: z.number().optional(),
  appName: z.string().optional(),
  showDisabled: z.boolean().optional(),
});
