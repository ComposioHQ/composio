import type { ReactNode } from 'react';
import { CircleCheck, CircleX, Lightbulb, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

type CalloutType = 'info' | 'warn' | 'warning' | 'error' | 'success' | 'tip' | 'idea';

interface CalloutProps {
  type?: CalloutType;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}

type ResolvedType = 'info' | 'warning' | 'error' | 'success' | 'idea';

function resolveType(type: CalloutType = 'info'): ResolvedType {
  if (type === 'warn') return 'warning';
  if (type === 'tip') return 'info';
  return type;
}

const variants: Record<
  ResolvedType,
  { container: string; icon?: typeof TriangleAlert; iconClass?: string }
> = {
  info: {
    container: 'text-fd-muted-foreground/75',
  },
  warning: {
    container: 'text-fd-muted-foreground/75',
    icon: TriangleAlert,
    iconClass: 'text-amber-500/45',
  },
  error: {
    container: 'text-fd-muted-foreground/75',
    icon: CircleX,
    iconClass: 'text-red-500/45',
  },
  success: {
    container: 'text-fd-muted-foreground/75',
    icon: CircleCheck,
    iconClass: 'text-emerald-500/45',
  },
  idea: {
    container: 'text-fd-muted-foreground/75',
    icon: Lightbulb,
    iconClass: 'text-fd-muted-foreground/50',
  },
};

export function Callout({ type = 'info', title, children, className }: CalloutProps) {
  const resolved = resolveType(type);
  const variant = variants[resolved];
  const Icon = variant.icon;

  return (
    <div
      data-callout=""
      className={cn(
        'not-prose my-3 text-xs leading-5',
        variant.container,
        className,
      )}
    >
      <div className={cn('flex gap-2', Icon ? 'items-start' : '')}>
        {Icon ? (
          <Icon className={cn('mt-0.5 size-3.5 shrink-0 stroke-[1.75]', variant.iconClass)} />
        ) : null}
        <div className="min-w-0 flex-1">
          {title ? (
            <p className="mb-1 font-medium text-fd-muted-foreground/90">{title}</p>
          ) : null}
          <div
            className={cn(
              'prose-no-margin',
              '[&_a]:text-fd-foreground [&_a]:underline [&_a]:decoration-fd-border [&_a]:underline-offset-2',
              '[&_a]:hover:decoration-fd-muted-foreground',
              '[&_code]:text-xs [&_code]:text-[#8fb7ff]',
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
