export function homePathForRole(role: string | null | undefined): '/dashboard/departments' | '/dashboard' {
  if (role === 'admin') return '/dashboard/departments';
  return '/dashboard';
}
