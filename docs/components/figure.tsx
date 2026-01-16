'use client';

import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';
import { cn } from '@/lib/utils';

type FigureSize = 'sm' | 'md' | 'lg' | 'full';

interface FigureProps {
  src: string;
  alt: string;
  caption?: string;
  size?: FigureSize;
  className?: string;
}

const sizeClasses: Record<FigureSize, string> = {
  sm: 'max-w-[300px]',   // Small dialogs, icons
  md: 'max-w-[500px]',   // Medium screenshots
  lg: 'max-w-[700px]',   // Large screenshots
  full: 'max-w-full',    // Full-width diagrams
};

export function Figure({ src, alt, caption, size = 'full', className }: FigureProps) {
  const isConstrained = size !== 'full';

  return (
    <figure className={cn('my-8', isConstrained && 'flex flex-col items-center', className)}>
      <Zoom>
        <img
          src={src}
          alt={alt}
          className={cn(
            'rounded-lg border border-fd-border',
            sizeClasses[size],
            isConstrained ? 'w-auto' : 'w-full'
          )}
        />
      </Zoom>
      {caption && (
        <figcaption className="mt-3 text-sm text-fd-muted-foreground text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
