export interface MemberRef {
  id: string;
  name: string;
}

/** Machine-readable 400 when voice create cannot resolve an assignee. */
export const ASSIGNEE_REQUIRED_CODE = 'assignee_required';
export const ASSIGNEE_REQUIRED_ERROR =
  'Could not tell who this task is for from the voice note. Pick an assignee and try again.';

export function isAssigneeRequiredError(
  payload: { code?: unknown; error?: unknown } | null | undefined,
): boolean {
  if (!payload) return false;
  if (payload.code === ASSIGNEE_REQUIRED_CODE) return true;
  return typeof payload.error === 'string' && payload.error.includes('Pick an assignee');
}

function fold(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Case-insensitive / fuzzy match of a spoken assignee hint to a team member.
 * Returns null when nothing is confident or two members tie.
 */
export function resolveAssigneeFromHint(
  hint: string | null | undefined,
  members: MemberRef[],
): MemberRef | null {
  const spoken = fold(hint ?? '');
  if (!spoken || members.length === 0) return null;

  const spokenTokens = spoken.split(' ').filter(Boolean);

  const scored = members
    .map((member) => {
      const full = fold(member.name);
      if (!full) return { member, score: 0 };
      const nameTokens = full.split(' ').filter(Boolean);

      let score = 0;
      if (full === spoken) score = 100;
      else if (nameTokens.some((token) => token === spoken)) score = 90;
      else if (spokenTokens.some((token) => token === full)) score = 85;
      else if (
        nameTokens.some(
          (token) =>
            token.length >= 3 &&
            (spokenTokens.includes(token) || spoken.includes(token)),
        )
      ) {
        score = 80;
      } else if (full.length >= 3 && (spoken.includes(full) || full.includes(spoken))) {
        score = 60;
      }
      return { member, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  if (scored[0].score < 80) return null;
  return scored[0].member;
}

/**
 * Voice create: a form-selected teammate wins over an AI name hint.
 * Unreliable / missing hints still resolve when the boss already picked someone.
 * Invalid form ids fall back to the hint so Auto-from-voice keeps working.
 */
export function resolveCreateAssignee(
  formAssigneeId: string | null | undefined,
  hint: string | null | undefined,
  members: MemberRef[],
): MemberRef | null {
  const formId = (formAssigneeId ?? '').trim();
  if (formId) {
    const formUser = members.find((member) => member.id === formId);
    if (formUser) return formUser;
  }
  return resolveAssigneeFromHint(hint, members);
}
