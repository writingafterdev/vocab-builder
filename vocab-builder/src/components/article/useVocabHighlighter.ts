'use client';

import { useEffect, useRef } from 'react';
import { annotate } from 'rough-notation';
import type { RoughAnnotation } from 'rough-notation/lib/model';

/**
 * Hook that applies rough-notation "highlight" annotations
 * to all .vocab-highlight <mark> elements within a container.
 * Produces a hand-drawn marker stroke effect (Magic UI Highlighter style).
 */
export function useVocabHighlighter(
    containerRef: React.RefObject<HTMLElement | null>,
    deps: unknown[] = []
) {
    const annotationsRef = useRef<RoughAnnotation[]>([]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Small delay to let DOM render
        const timer = setTimeout(() => {
            // Clean up old annotations
            annotationsRef.current.forEach(a => a.remove());
            annotationsRef.current = [];

            const marks = container.querySelectorAll<HTMLElement>('.vocab-highlight');

            marks.forEach(mark => {
                const annotation = annotate(mark, {
                    type: 'highlight',
                    color: 'rgba(255, 195, 0, 0.45)',
                    strokeWidth: 2,
                    animationDuration: 500,
                    iterations: 2,
                    padding: 3,
                    multiline: true,
                });

                annotationsRef.current.push(annotation);
                annotation.show();
            });
        }, 100);

        return () => {
            clearTimeout(timer);
            annotationsRef.current.forEach(a => a.remove());
            annotationsRef.current = [];
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
