'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { LoginForm } from '@/components/login-form';

export default function LoginPage(): React.ReactElement | null {
  const { accessToken, isInitializing } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isInitializing && accessToken) {
      router.replace('/leads');
    }
  }, [isInitializing, accessToken, router]);

  if (isInitializing || accessToken) return null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-xl font-semibold">GmLeads Dashboard</h1>
      <LoginForm />
    </div>
  );
}
