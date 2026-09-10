export type TitledTask = {
  title: string;
  title_id?: string | null;
};

export type TaskHeading = {
  primary: string;
  secondary: string;
};

/** English is the main heading for every role. Staff may see Indonesian as secondary when it differs. */
export function taskTitles(task: TitledTask, role: string): TaskHeading {
  const en = (task.title || '').trim();
  const id = (task.title_id || '').trim();
  const primary = en || id;
  const secondary = role !== 'boss' && id && id !== primary ? id : '';
  return { primary, secondary };
}
