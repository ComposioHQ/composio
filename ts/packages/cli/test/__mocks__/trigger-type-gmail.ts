import type { TriggerType } from 'src/models/trigger-types';
import TRIGGER_TYPES from './trigger-types.json' with { type: 'json' };

export const TRIGGER_TYPE_GMAIL = TRIGGER_TYPES.find(
  triggerType => triggerType.slug === 'GMAIL_NEW_GMAIL_MESSAGE'
)! as TriggerType;
