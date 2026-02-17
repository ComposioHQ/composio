'use client';

import { useState } from 'react';
import Image from 'next/image';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';
import { cn } from '@/lib/utils';

type FigureSize = 'sm' | 'md' | 'lg' | 'full';

interface FigureProps {
  src: string;
  /** Dark-mode variant of the image. Shown when the site theme is dark. */
  srcDark?: string;
  alt: string;
  caption?: string;
  size?: FigureSize;
  className?: string;
  width?: number;
  height?: number;
  /** Set to true for above-the-fold images to prioritize LCP */
  priority?: boolean;
}

const sizeClasses: Record<FigureSize, string> = {
  sm: 'max-w-[300px]',   // Small dialogs, icons
  md: 'max-w-[500px]',   // Medium screenshots
  lg: 'max-w-[700px]',   // Large screenshots
  full: 'max-w-full',    // Full-width diagrams
};

// Default dimensions per size to minimize CLS
const defaultDimensions: Record<FigureSize, { width: number; height: number }> = {
  sm: { width: 300, height: 200 },
  md: { width: 500, height: 333 },
  lg: { width: 700, height: 467 },
  full: { width: 900, height: 600 },
};

// Responsive sizes for optimal image loading
const sizesAttr: Record<FigureSize, string> = {
  sm: '(max-width: 640px) 100vw, 300px',
  md: '(max-width: 640px) 100vw, 500px',
  lg: '(max-width: 640px) 100vw, (max-width: 768px) 90vw, 700px',
  full: '(max-width: 640px) 100vw, (max-width: 1024px) 90vw, min(900px, 70vw)',
};

export function Figure({ src, srcDark, alt, caption, size = 'full', className, width, height, priority = false }: FigureProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const isConstrained = size !== 'full';
  const dimensions = defaultDimensions[size];

  // Show image on load or error (so broken images are visible for debugging)
  const handleReady = () => setIsLoaded(true);

  const imgClasses = cn(
    'rounded-lg border border-fd-border transition-opacity duration-300',
    isLoaded ? 'opacity-100' : 'opacity-0',
    sizeClasses[size],
    isConstrained ? 'w-auto h-auto' : 'w-full h-auto'
  );

  const sharedProps = {
    alt,
    width: width || dimensions.width,
    height: height || dimensions.height,
    sizes: sizesAttr[size],
    priority,
    onError: handleReady,
  };

  return (
    <figure className={cn('my-8', isConstrained && 'flex flex-col items-center', className)}>
      {srcDark ? (
        <>
          <Zoom zoomImg={{ src }}>
            <Image
              src={src}
              {...sharedProps}
              onLoad={handleReady}
              className={cn(imgClasses, 'dark:hidden')}
            />
          </Zoom>
          <Zoom zoomImg={{ src: srcDark }}>
            <Image
              src={srcDark}
              {...sharedProps}
              onLoad={handleReady}
              className={cn(imgClasses, 'hidden dark:block')}
            />
          </Zoom>
        </>
      ) : (
        <Zoom zoomImg={{ src }}>
          <Image
            src={src}
            {...sharedProps}
            onLoad={handleReady}
            className={imgClasses}
          />
        </Zoom>
      )}
      {caption && (
        <figcaption className="mt-3 text-sm text-fd-muted-foreground text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
