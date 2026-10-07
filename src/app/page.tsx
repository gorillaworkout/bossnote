import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { homePathForRole } from '@/lib/home-path';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ lark_error?: string | string[] }>;
}) {
  const user = await getSession();
  if (user) redirect(homePathForRole(user.role));
  const params = await searchParams;
  const raw = params.lark_error;
  const code = Array.isArray(raw) ? raw[0] : raw;
  return <LoginForm larkError={typeof code === 'string' ? code : ''} />;
}
