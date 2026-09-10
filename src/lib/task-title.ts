export type TitledTask = {
  title: string;
  title_id?: string | null;
};

export type TaskHeading = {
  primary: string;
  secondary: string;
};

/** Boss: English title primary (Indonesian hidden). Staff: Indonesian primary, English secondary. */
export function taskTitles(task: TitledTask, role: string): TaskHeading {
  const en = (task.title || '').trim();
  const id = (task.title_id || '').trim();
  if (role === 'boss') return { primary: en || id, secondary: '' };
  return { primary: id || en, secondary: en && en !== id ? en : '' };
}
