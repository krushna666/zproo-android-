import type { HotelImage } from '@zproo/types';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@zproo/ui';
import { ChevronLeft, ChevronRight, Images } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';

/**
 * Photo grid with a lightbox: arrow keys or swipes move between photos, Escape closes it and
 * focus returns to the button that opened it (the dialog traps focus while open).
 */
export function Gallery({ images, name }: { images: readonly HotelImage[]; name: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  // Several buttons open the lightbox; focus goes back to the one used.
  const opener = useRef<HTMLElement | null>(null);
  const count = images.length;
  const go = (delta: number) => setIndex((i) => (i + delta + count) % count);
  const show = (i: number) => {
    opener.current = document.activeElement as HTMLElement | null;
    setIndex(i);
    setOpen(true);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    }
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchX.current;
    const end = e.changedTouches[0]?.clientX;
    touchX.current = null;
    if (start === null || end === undefined || Math.abs(end - start) < 40) return;
    go(end < start ? 1 : -1);
  };
  const current = images[index];

  return (
    <div>
      <div className="grid h-64 grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-[14px] sm:h-80">
        {images.slice(0, 5).map((image, i) => (
          <button
            key={`${image.url}-${i}`}
            type="button"
            onClick={() => show(i)}
            className={
              i === 0 ? 'col-span-4 row-span-2 sm:col-span-2' : 'hidden overflow-hidden sm:block'
            }
            aria-label={`Open photo ${i + 1} of ${count}: ${image.alt}`}
          >
            <img
              src={image.url}
              alt={image.alt}
              loading={i === 0 ? 'eager' : 'lazy'}
              className="size-full object-cover transition-transform hover:scale-[1.02]"
            />
          </button>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        data-testid="hotel-gallery-open"
        onClick={() => show(0)}
      >
        <Images aria-hidden /> View all {count} photos
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-testid="hotel-lightbox"
          className="top-[6vh] max-w-4xl p-4 sm:p-6"
          onKeyDown={onKeyDown}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus();
          }}
          onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
          onTouchEnd={onTouchEnd}
        >
          <DialogTitle className="pr-10 text-base">{name} — photos</DialogTitle>
          <DialogDescription className="sr-only">
            Use the arrow keys or swipe to move between photos. Press Escape to close.
          </DialogDescription>
          {current && (
            <figure className="mt-3">
              <img
                src={current.url}
                alt={current.alt}
                className="aspect-[4/3] w-full rounded-xl bg-background object-cover"
              />
              <figcaption className="mt-2 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{current.alt}</span>
                <span className="shrink-0 text-muted tabular-nums" aria-live="polite">
                  {index + 1} / {count}
                </span>
              </figcaption>
            </figure>
          )}
          <div className="mt-3 flex justify-between">
            <Button variant="outline" size="sm" onClick={() => go(-1)} aria-label="Previous photo">
              <ChevronLeft aria-hidden /> Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => go(1)} aria-label="Next photo">
              Next <ChevronRight aria-hidden />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
