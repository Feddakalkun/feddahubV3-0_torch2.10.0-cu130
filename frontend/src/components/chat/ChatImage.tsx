import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/**
 * ComfyUI returns a /comfy/view URL; what it points at is in the filename.
 *
 * Reading the extension rather than guessing from the workflow name: the
 * MiniMax clip came back as 0_00002-audio.mp4, and a rule keyed on words like
 * "video" or "wan" would have to know every workflow that can emit one.
 */
const isVideoUrl = (src: string): boolean => {
  const m = /[?&]filename=([^&]+)/.exec(src);
  const name = decodeURIComponent(m ? m[1] : src);
  return /\.(mp4|webm|mov|mkv|m4v)$/i.test(name);
};

/**
 * A chat result: small in the transcript, full size on click.
 *
 * Inline results used to run to 420px, so two of them pushed the input off
 * screen and the conversation stopped being readable. The thumbnail keeps the
 * transcript scannable and the lightbox is where you actually inspect a result.
 *
 * Video goes through an actual <video>. It used to come through the <img>
 * below, which renders precisely nothing - a MiniMax run reported "Done." over
 * an empty space for seven and a half minutes of work. No lightbox for it: the
 * player's own controls already carry fullscreen, and a click-to-enlarge
 * wrapper would swallow the clicks meant for play and scrub.
 */
export const ChatImage = ({ src, dim = false }: { src: string; dim?: boolean }) => {
  const [open, setOpen] = useState(false);

  // Escape closes, and the listener only exists while the lightbox is open.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (isVideoUrl(src)) {
    return (
      <video
        src={src}
        controls
        loop
        playsInline
        className={`mt-2 max-h-52 rounded-xl ${dim ? 'opacity-90' : ''}`}
      />
    );
  }

  return (
    <>
      <img
        src={src}
        alt=""
        onClick={() => setOpen(true)}
        title="Click to enlarge"
        className={`mt-2 max-h-52 cursor-zoom-in rounded-xl transition hover:brightness-110 ${dim ? 'opacity-90' : ''}`}
      />
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-5 top-5 rounded-lg border border-white/15 p-2 text-white/60 transition hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          {/* Stop the click from bubbling to the backdrop, so clicking the
              picture itself does not close the view you just opened. */}
          <img
            src={src}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </div>
      )}
    </>
  );
};
