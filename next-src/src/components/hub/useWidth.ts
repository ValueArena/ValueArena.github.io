'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * The element's rendered width, so charts lay out in real pixels at every screen size.
 * A callback ref, so it measures an element that mounts after a loading state.
 */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(fallback);
  const ref = useCallback((element: T | null) => setNode(element), []);
  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [ref, width] as const;
}
