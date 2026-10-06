'use client';

import { useState } from 'react';

export function TaskScreenshot({
  shots,
  busy,
  progress,
  error,
  onFiles,
  onRemove,
}: {
  shots: { index: number; src: string }[];
  busy?: boolean;
  progress: number | null;
  error: string | null;
  onFiles: (files: File[]) => void;
  onRemove?: (index: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const safeActive = shots.length === 0 ? 0 : Math.min(active, shots.length - 1);
  const current = shots[safeActive];
  const openShot = open === null ? null : shots.find((shot) => shot.index === open) || null;

  return (
    <section className="card p-4 mb-4">
      <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.12em] mb-3">
        {shots.length > 1 ? `Screenshots (${shots.length})` : 'Screenshot'}
      </h3>
      {current ? (
        <button type="button" onClick={() => setOpen(current.index)} className="block w-full text-left">
          <img
            src={current.src}
            alt="Task screenshot"
            className="w-full max-h-[70vh] object-contain rounded-lg bg-zinc-950 border border-zinc-800"
          />
        </button>
      ) : (
        <p className="text-[13px] text-zinc-500 mb-2">No screenshot yet.</p>
      )}
      {shots.length > 1 && (
        <div className="flex gap-2 overflow-x-auto mt-2 pb-1">
          {shots.map((shot, position) => (
            <div key={`${shot.index}-${shot.src}`} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setActive(position)}
                className={`block w-16 h-16 rounded-md overflow-hidden border ${position === safeActive ? 'border-violet-500' : 'border-zinc-800'}`}
              >
                <img src={shot.src} alt={`Screenshot ${position + 1}`} className="w-full h-full object-cover" />
              </button>
              {onRemove && (
                <button
                  type="button"
                  aria-label={`Remove screenshot ${position + 1}`}
                  disabled={busy}
                  onClick={() => onRemove(shot.index)}
                  className="absolute -top-1 -right-1 min-w-7 min-h-7 rounded-full bg-black/80 text-[12px] text-zinc-100 disabled:opacity-40"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {shots.length === 1 && onRemove && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onRemove(shots[0].index)}
          className="mt-2 min-h-10 text-[12px] text-zinc-400 underline disabled:opacity-40"
        >
          Remove screenshot
        </button>
      )}
      <label className={`inline-flex items-center mt-3 min-h-11 px-3 py-2 rounded-md bg-zinc-800 text-zinc-200 text-[12px] font-medium ${busy ? 'opacity-40' : 'hover:bg-zinc-700'}`}>
        {busy ? 'Uploading photo…' : shots.length ? 'Add screenshots' : 'Add screenshot'}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            if (files.length) onFiles(files);
          }}
        />
      </label>
      {progress !== null && (
        <div className="mt-2" aria-live="polite">
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full bg-violet-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[11px] text-violet-300 mt-1">Uploading photo… {progress}%</p>
        </div>
      )}
      {error && <p className="text-[12px] text-red-400 mt-2 leading-relaxed">{error}</p>}
      {openShot && (
        <div
          className="fixed inset-0 z-[70] bg-black/92 p-3 flex flex-col"
          onClick={() => setOpen(null)}
        >
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-zinc-400 px-2">
              {shots.findIndex((shot) => shot.index === openShot.index) + 1} / {shots.length}
            </p>
            <button type="button" className="text-[13px] text-zinc-300 px-3 py-2 min-h-11" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
          <img src={openShot.src} alt="Task screenshot" className="flex-1 min-h-0 w-full object-contain" />
          {shots.length > 1 && (
            <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="flex-1 min-h-11 rounded-lg bg-zinc-800 text-[13px] text-zinc-100"
                onClick={() => {
                  const position = shots.findIndex((shot) => shot.index === openShot.index);
                  const prev = shots[(position - 1 + shots.length) % shots.length];
                  setOpen(prev.index);
                  setActive(shots.indexOf(prev));
                }}
              >
                Previous
              </button>
              <button
                type="button"
                className="flex-1 min-h-11 rounded-lg bg-zinc-800 text-[13px] text-zinc-100"
                onClick={() => {
                  const position = shots.findIndex((shot) => shot.index === openShot.index);
                  const next = shots[(position + 1) % shots.length];
                  setOpen(next.index);
                  setActive(shots.indexOf(next));
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
