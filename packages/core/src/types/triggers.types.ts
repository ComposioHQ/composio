import { z } from "zod";

export type TriggerStatusEnum = "enable" | "disable";

export const ZTriggerSubscribeParam = z.object({
    appName: z.string().optional(),
    triggerId: z.string().optional(),
    connectionId: z.string().optional(),
    integrationId: z.string().optional(),
    triggerName: z.string().optional(),
    triggerData: z.string().optional(),
    entityId: z.string().optional(),
});
export type TriggerSubscribeParams = z.infer<typeof ZTriggerSubscribeParam>;