import { z } from "zod";

export const ZGetAppParams = z.object({
  appKey: z.string(),
});

export const ZGetRequiredParams = z.object({
  appId: z.string(),
});

export const ZGetRequiredParamsForAuthScheme = z.object({
  appId: z.string(),
  authScheme: z.string(),
});

export const ZRequiredParamsResponse = z.object({
  required_fields: z.array(z.string()),
  expected_from_user: z.array(z.string()),
  optional_fields: z.array(z.string()),
});

export const ZRequiredParamsFullResponse = z.object({
  availableAuthSchemes: z.array(z.string()),
  authSchemes: z.record(z.string(), ZRequiredParamsResponse),
});
