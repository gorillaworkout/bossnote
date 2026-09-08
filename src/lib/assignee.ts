export interface MemberRef {
  id: string;
  name: string;
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
