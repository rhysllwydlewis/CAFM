'use client';

import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

export const PAD = { width: 600, height: 200 };

/** A drawing pad for a finger or stylus. Dark ink on a light pad in either theme, because it is printed on white. */
export function SignaturePad({
  padRef,
  onDrawn,
  label,
}: {
  padRef: RefObject<HTMLCanvasElement | null>;
  onDrawn: (drawn: boolean) => void;
  label: string;
}) {
  const drawing = useRef(false);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * PAD.width,
      y: ((event.clientY - box.top) / box.height) * PAD.height,
    };
  };
  const context = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--graphite-900').trim() || 'black';
    }
    return ctx;
  };
  return (
    <canvas
      ref={padRef}
      width={PAD.width}
      height={PAD.height}
      role="img"
      aria-label={label}
      style={{
        display: 'block',
        width: '100%',
        aspectRatio: '3 / 1',
        border: '1px dashed var(--border-strong)',
        borderRadius: 10,
        background: 'var(--graphite-0)',
        touchAction: 'none',
      }}
      onPointerDown={(event) => {
        const ctx = context(event.currentTarget);
        if (!ctx) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = true;
        const { x, y } = point(event);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.01, y);
        ctx.stroke();
        onDrawn(true);
      }}
      onPointerMove={(event) => {
        if (!drawing.current) return;
        const ctx = context(event.currentTarget);
        const { x, y } = point(event);
        ctx?.lineTo(x, y);
        ctx?.stroke();
      }}
      onPointerUp={() => {
        drawing.current = false;
      }}
      onPointerCancel={() => {
        drawing.current = false;
      }}
    />
  );
}
