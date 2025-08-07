import TRIGGER_TYPES from './trigger-types.json' with { type: 'json' };
import { TriggerType } from 'src/models/trigger-types';

export const TRIGGER_TYPES_GITHUB = TRIGGER_TYPES.filter(triggerType =>
  triggerType.slug.startsWith('GITHUB_')
) as TriggerType[];
