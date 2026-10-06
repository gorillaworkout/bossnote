'use client';

export function TaskImageField({
  previews,
  error,
  progress,
  disabled,
  onFiles,
  onRemove,
}: {
  previews: string[];
  error: string | null;
  progress: number | null;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="text-left mb-3">
      <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Screenshot (optional)</label>
      <p className="text-[11px] text-zinc-600 mb-2 leading-relaxed">
        Add one or more photos. Boss sees them on the task. If one upload fails, the task is still saved and you can retry.
      </p>
      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {previews.map((url, index) => (
            <div key={`${url}-${index}`} className="relative">
              <img
                src={url}
                alt={`Screenshot ${index + 1}`}
                className="w-full h-20 object-cover rounded-lg bg-zinc-950 border border-zinc-800"
              />
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove screenshot ${index + 1}`}
                onClick={() => onRemove(index)}
                className="absolute top-1 right-1 min-w-7 min-h-7 px-1.5 rounded-md bg-black/70 text-[12px] text-zinc-100 disabled:opacity-40"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <label className={`flex items-center justify-center w-full min-h-11 py-3 px-3 rounded-lg border border-dashed border-zinc-700 text-[13px] text-zinc-300 ${disabled ? 'opacity-40' : 'active:bg-zinc-800'}`}>
        {previews.length ? 'Add more photos' : 'Add photos'}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={disabled}
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
            <div className="h-full bg-violet-500 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[11px] text-violet-300 mt-1">Uploading photo… {progress}%</p>
        </div>
      )}
      {error && <p className="text-[12px] text-red-400 mt-2 leading-relaxed">{error}</p>}
    </div>
  );
}
