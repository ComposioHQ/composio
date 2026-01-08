'use client';

import * as React from 'react';
import {
  Info,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Lightbulb,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Callout types with their styling and icons
 */
const CALLOUT_TYPES = {
  info: {
    icon: Info,
    label: 'Info',
    className: 'border-blue-500/50 bg-blue-500/5',
    iconClassName: 'text-blue-500',
  },
  warning: {
    icon: AlertTriangle,
    label: 'Warning',
    className: 'border-yellow-500/50 bg-yellow-500/5',
    iconClassName: 'text-yellow-500',
  },
  error: {
    icon: XCircle,
    label: 'Error',
    className: 'border-red-500/50 bg-red-500/5',
    iconClassName: 'text-red-500',
  },
  success: {
    icon: CheckCircle,
    label: 'Success',
    className: 'border-green-500/50 bg-green-500/5',
    iconClassName: 'text-green-500',
  },
  tip: {
    icon: Lightbulb,
    label: 'Tip',
    className: 'border-purple-500/50 bg-purple-500/5',
    iconClassName: 'text-purple-500',
  },
  note: {
    icon: Info,
    label: 'Note',
    className: 'border-fd-border bg-fd-muted/50',
    iconClassName: 'text-fd-muted-foreground',
  },
  important: {
    icon: Zap,
    label: 'Important',
    className: 'border-composio-orange/50 bg-composio-orange/5',
    iconClassName: 'text-composio-orange',
  },
} as const;

type CalloutType = keyof typeof CALLOUT_TYPES;

interface CalloutProps {
  /**
   * Type of callout - determines icon and styling
   * @default 'note'
   */
  type?: CalloutType;
  /**
   * Custom title (overrides default label)
   */
  title?: string;
  /**
   * Custom icon component
   */
  icon?: LucideIcon;
  /**
   * Callout content
   */
  children: React.ReactNode;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * Polished callout component with icons and semantic styling
 *
 * Usage in MDX:
 * ```mdx
 * <Callout type="warning" title="Be careful">
 *   This action cannot be undone.
 * </Callout>
 *
 * <Callout type="tip">
 *   Pro tip: Use keyboard shortcuts for faster navigation.
 * </Callout>
 * ```
 */
export function CalloutEnhanced({
  type = 'note',
  title,
  icon: CustomIcon,
  children,
  className,
}: CalloutProps) {
  const config = CALLOUT_TYPES[type];
  const Icon = CustomIcon || config.icon;
  const displayTitle = title || config.label;

  return (
    <div
      className={cn(
        'callout my-6 rounded-lg border-l-4 p-4',
        config.className,
        className
      )}
      role="note"
      aria-label={displayTitle}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn('mt-0.5 h-5 w-5 shrink-0', config.iconClassName)}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          {displayTitle && (
            <p className="mb-1 font-semibold text-fd-foreground">
              {displayTitle}
            </p>
          )}
          <div className="text-sm text-fd-foreground/90 [&>p]:m-0 [&>p:not(:first-child)]:mt-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Shorthand components for common callout types
 */
export const InfoCallout = (props: Omit<CalloutProps, 'type'>) => (
  <CalloutEnhanced type="info" {...props} />
);

export const WarningCallout = (props: Omit<CalloutProps, 'type'>) => (
  <CalloutEnhanced type="warning" {...props} />
);

export const ErrorCallout = (props: Omit<CalloutProps, 'type'>) => (
  <CalloutEnhanced type="error" {...props} />
);

export const SuccessCallout = (props: Omit<CalloutProps, 'type'>) => (
  <CalloutEnhanced type="success" {...props} />
);

export const TipCallout = (props: Omit<CalloutProps, 'type'>) => (
  <CalloutEnhanced type="tip" {...props} />
);

export const NoteCallout = (props: Omit<CalloutProps, 'type'>) => (
  <CalloutEnhanced type="note" {...props} />
);

export const ImportantCallout = (props: Omit<CalloutProps, 'type'>) => (
  <CalloutEnhanced type="important" {...props} />
);
