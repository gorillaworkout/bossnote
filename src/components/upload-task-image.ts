export type ImageUploadResult = {
  ok: boolean;
  error?: string;
  image_path?: string;
  image_paths?: string[];
};

/** Upload with progress. A failed photo never rolls back the task. */
export function uploadTaskImage(
  taskId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<ImageUploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/tasks/${encodeURIComponent(taskId)}/image`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) return;
      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onerror = () => {
      resolve({
        ok: false,
        error: 'Photo upload failed. Check your connection and retry. The task is already saved.',
      });
    };
    xhr.onload = () => {
      let data: { error?: string; image_path?: string; image_paths?: unknown } = {};
      try {
        data = JSON.parse(xhr.responseText || '{}') as { error?: string; image_path?: string; image_paths?: unknown };
      } catch {
        data = {};
      }
      const imagePaths = Array.isArray(data.image_paths)
        ? data.image_paths.filter((item): item is string => typeof item === 'string' && item.length > 0)
        : undefined;
      if (xhr.status >= 200 && xhr.status < 300 && data.image_path) {
        onProgress?.(100);
        resolve({ ok: true, image_path: data.image_path, image_paths: imagePaths });
        return;
      }
      resolve({
        ok: false,
        error: data.error || `Photo upload failed (${xhr.status}). The task is already saved.`,
      });
    };
    const form = new FormData();
    form.append('image', file, file.name || 'screenshot.jpg');
    xhr.send(form);
  });
}
