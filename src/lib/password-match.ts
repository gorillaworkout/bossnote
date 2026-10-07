import bcrypt from 'bcryptjs';

/** A bad hash is a failed login, not a 500. */
export async function passwordMatches(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, passwordHash);
  } catch {
    return false;
  }
}
