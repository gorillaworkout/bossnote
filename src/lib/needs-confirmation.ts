export type QuestionTask = {
  questions?: readonly unknown[] | null;
  answered_questions?: readonly unknown[] | null;
};

export function unansweredCount(task: QuestionTask): number {
  const questions = Array.isArray(task.questions) ? task.questions.length : 0;
  const answered = Array.isArray(task.answered_questions) ? task.answered_questions.length : 0;
  return questions > answered ? questions - answered : 0;
}

/** Same rule as the header badge: more questions than answered entries. */
export function needsConfirmation(task: QuestionTask): boolean {
  return unansweredCount(task) > 0;
}

export function confirmationAction<T extends QuestionTask & { id: string }>(
  tasks: readonly T[],
): { kind: 'none' } | { kind: 'open'; id: string } | { kind: 'filter' } {
  const pending = tasks.filter(needsConfirmation);
  if (pending.length === 1) return { kind: 'open', id: pending[0].id };
  if (pending.length > 1) return { kind: 'filter' };
  return { kind: 'none' };
}
