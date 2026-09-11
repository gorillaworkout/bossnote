import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ManageUsersLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect('/');
  if (user.role !== 'boss') redirect('/dashboard');
  return children;
}
