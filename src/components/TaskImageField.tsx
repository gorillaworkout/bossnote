'use client';

export function TaskImageField({
  previewUrl,
  error,
  progress,
  disabled,
  onFile,
  onClear,
}: {
  previewUrl: string | null;
  error: string | null;
  progress: number | null;
  disabled?: boolean;
  onFile: (file: File | null) => void;
  onClear: () => void;
}) {
  return (
    <div className="text-left mb-3">
      <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Screenshot (optional)</label>
      <p className="text-[11px] text-zinc-600 mb-2 leading-relaxed">
        Boss sees this photo on the task. If the upload fails, the task is still saved and you can retry.
      </p>
      {previewUrl ? (
        <div className="relative">
          <img src={previewUrl} alt="Screenshot preview" className="w-full max-h-40 object-contain rounded-lg bg-zinc-950 border border-zinc-800" />
          <button
            type="button"
            disabled={disabled}
            onClick={onClear}
            className="absolute top-1.5 right-1.5 px-2 py-1 rounded-md bg-black/70 text-[11px] text-zinc-200 disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      ) : (
        <label className={`flex items-center justify-center w-full min-h-16 py-3 px-3 rounded-lg border border-dashed border-zinc-700 text-[13px] text-zinc-300 ${disabled ? 'opacity-40' : 'active:bg-zinc-800'}`}>
          Add photo
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              e.target.value = '';
              onFile(file);
            }}
          />
        </label>
      )}
      {progress !== null && (
        <div className="mt-2" aria-live="polite">
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full bg-violet-500 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[11px] text-violet-300 mt-1">Uploading photo… {progress}%</p>
        </div>
      )}
      {error && <p className="text-[12px] text-red-400 mt-2 leading-relaxed">{error}</p>}
    </div>
  );
}
