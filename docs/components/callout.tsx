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
    container: 'border-fd-border/40 bg-fd-muted/35 text-fd-muted-foreground',
  },
  warning: {
    container: 'border-amber-600/15 bg-amber-500/[0.04] text-fd-muted-foreground',
    icon: TriangleAlert,
    iconClass: 'text-amber-600/60',
  },
  error: {
    container: 'border-red-500/15 bg-red-500/[0.04] text-fd-muted-foreground',
    icon: CircleX,
    iconClass: 'text-red-500/60',
  },
  success: {
    container: 'border-emerald-600/15 bg-emerald-500/[0.04] text-fd-muted-foreground',
    icon: CircleCheck,
    iconClass: 'text-emerald-600/60',
  },
  idea: {
    container: 'border-fd-border/40 bg-fd-muted/35 text-fd-muted-foreground',
    icon: Lightbulb,
    iconClass: 'text-fd-muted-foreground/70',
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
        'not-prose my-3 rounded-md border px-3 py-2 text-[0.8125rem] leading-relaxed',
        variant.container,
        className,
      )}
    >
      <div className={cn('flex gap-2', Icon ? 'items-start' : '')}>
        {Icon ? (
          <Icon className={cn('mt-0.5 size-3.5 shrink-0 stroke-[1.75]', variant.iconClass)} />
        ) : null}
        <div className="min-w-0 flex-1">
          {title ? <p className="mb-1 font-medium text-fd-foreground">{title}</p> : null}
          <div
            className={cn(
              'prose-no-margin',
              '[&_a]:text-fd-foreground [&_a]:underline [&_a]:decoration-fd-border [&_a]:underline-offset-2',
              '[&_a]:hover:decoration-fd-muted-foreground',
              '[&_code]:text-[0.8125rem] [&_code]:text-fd-foreground/80',
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
