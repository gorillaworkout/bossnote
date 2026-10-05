'use client';

import { useState } from 'react';

export function TaskScreenshot({
  src,
  busy,
  progress,
  error,
  onFile,
}: {
  src: string;
  busy?: boolean;
  progress: number | null;
  error: string | null;
  onFile: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="card p-4 mb-4">
      <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.12em] mb-3">Screenshot</h3>
      {src ? (
        <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
          <img
            src={src}
            alt="Task screenshot"
            className="w-full max-h-[70vh] object-contain rounded-lg bg-zinc-950 border border-zinc-800"
          />
        </button>
      ) : (
        <p className="text-[13px] text-zinc-500 mb-2">No screenshot yet.</p>
      )}
      <label className={`inline-flex items-center mt-3 min-h-10 px-3 py-2 rounded-md bg-zinc-800 text-zinc-200 text-[12px] font-medium ${busy ? 'opacity-40' : 'hover:bg-zinc-700'}`}>
        {busy ? 'Uploading photo…' : src ? 'Replace screenshot' : 'Add screenshot'}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onFile(file);
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
      {open && src && (
        <div
          className="fixed inset-0 z-[70] bg-black/92 p-3 flex flex-col"
          onClick={() => setOpen(false)}
        >
          <button type="button" className="self-end text-[13px] text-zinc-300 px-2 py-2" onClick={() => setOpen(false)}>
            Close
          </button>
          <img src={src} alt="Task screenshot" className="flex-1 min-h-0 w-full object-contain" />
        </div>
      )}
    </section>
  );
}
