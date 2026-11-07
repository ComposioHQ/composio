import { z } from 'zod';

export const instantSchema = z.object({
  supported: z.boolean().optional().catch(undefined),
  price: z.object({
    description: z.string().optional().catch(undefined),
    discount: z.string().optional().catch(undefined),
  }).optional().catch(undefined),
}).optional().catch(undefined);

export type Instant = z.infer<typeof instantSchema>;

export function toolkitSupportsInstant(instant: Instant, tools: { instant?: Instant }[]): boolean {
  return instant?.supported === true || tools.some(tool => tool.instant?.supported === true);
}

export function instantPricingDescription(instant: Instant): string | undefined {
  if (instant?.supported !== true) return undefined;
  return instant.price?.description?.trim() || 'Pricing is not available.';
}

export function instantDiscount(instant: Instant): string | undefined {
  if (instant?.supported !== true) return undefined;
  const discount = instant.price?.discount;
  return discount?.trim() && discount.trim() !== '0' ? discount : undefined;
}
