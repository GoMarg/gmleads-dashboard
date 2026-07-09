'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function HomePage(): null {
  const { accessToken, isInitializing } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isInitializing) return;
    router.replace(accessToken ? '/leads' : '/login');
  }, [isInitializing, accessToken, router]);

  return null;
}
