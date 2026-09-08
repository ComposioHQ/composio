'use client';

import { useEffect } from 'react';

export function ProductTransitionLoader() {
  useEffect(() => {
    if (typeof CSS === 'undefined' || !('paintWorklet' in CSS)) return;

    const properties = [
      { name: '--docs-reveal-radius', syntax: '<percentage>', initialValue: '0%' },
      { name: '--docs-pixel-size', syntax: '<number>', initialValue: '20' },
      { name: '--docs-dissolve-amount', syntax: '<number>', initialValue: '0.65' },
    ];

    for (const property of properties) {
      try {
        CSS.registerProperty({ ...property, inherits: false });
      } catch {
        // The CSS @property rule or React Strict Mode may register it first.
      }
    }

    const paintWorklet = (CSS as typeof CSS & {
      paintWorklet: { addModule: (url: string) => Promise<void> };
    }).paintWorklet;
    void paintWorklet.addModule('/pixelated-circle-worklet.js').catch(() => undefined);
  }, []);

  return null;
}
