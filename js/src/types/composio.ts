import { z } from "zod";
import { ZAuthMode } from "../sdk/types/integration";

const ZExpectedInputFields = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
  display_name: z.string(),
  default: z.record(z.unknown()),
  required: z.boolean(),
  expected_from_customer: z.boolean(),
  is_secret: z.boolean(),
});

export const ZGetExpectedParamsForUserParams = z.object({
  app: z.string().optional(),
  integrationId: z.string().optional(),
  entityId: z.string().optional(),
  authScheme: ZAuthMode.optional(),
});

export const ZGetExpectedParamsRes = z.object({
  expectedInputFields: z.array(ZExpectedInputFields),
  integrationId: z.string(),
  authScheme: ZAuthMode,
});
