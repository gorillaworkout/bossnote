import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import TaskBoard from '@/components/TaskBoard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect('/');
  if (user.role === 'admin') redirect('/dashboard/departments');
  return <TaskBoard />;
}
