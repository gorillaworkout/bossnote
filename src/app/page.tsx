import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { homePathForRole } from '@/lib/home-path';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getSession();
  if (user) redirect(homePathForRole(user.role));
  return <LoginForm />;
}
