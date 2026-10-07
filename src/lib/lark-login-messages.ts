export const LARK_LOGIN_ERROR_SENTENCES = {
  denied: 'Lark sign-in was cancelled.',
  state: 'Lark sign-in expired. Try again.',
  org: 'This Lark account is not in the BossNote organization.',
  admin: 'The admin account signs in with a password.',
  unavailable: 'Lark sign-in is not available.',
  scope: 'Lark did not grant the permissions BossNote needs.',
  failed: 'Lark sign-in failed. Try again or use your password.',
} as const;

export type LarkLoginErrorCode = keyof typeof LARK_LOGIN_ERROR_SENTENCES;

export function larkLoginErrorSentence(code: string | null | undefined): string {
  if (!code) return '';
  if (Object.prototype.hasOwnProperty.call(LARK_LOGIN_ERROR_SENTENCES, code)) {
    return LARK_LOGIN_ERROR_SENTENCES[code as LarkLoginErrorCode];
  }
  return LARK_LOGIN_ERROR_SENTENCES.failed;
}
