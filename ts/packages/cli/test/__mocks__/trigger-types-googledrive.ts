import TRIGGER_TYPES from './trigger-types.json' with { type: 'json' };
import { TriggerType } from 'src/models/trigger-types';

export const TRIGGER_TYPES_GOOGLEDRIVE = TRIGGER_TYPES.filter(triggerType =>
  triggerType.slug.startsWith('GOOGLEDRIVE')
) as TriggerType[];
