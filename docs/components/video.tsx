'use client';

import { cn } from '@/lib/utils';

interface VideoProps {
  src: string;
  caption?: string;
  poster?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  className?: string;
}

export function Video({
  src,
  caption,
  poster,
  autoPlay = false,
  loop = true,
  muted = true,
  controls = true,
  className,
}: VideoProps) {
  return (
    <figure className={cn('my-8', className)}>
      <video
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        controls={controls}
        playsInline
        preload="metadata"
        className="w-full rounded-lg border border-fd-border"
      />
      {caption && (
        <figcaption className="mt-3 text-sm text-fd-muted-foreground text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
