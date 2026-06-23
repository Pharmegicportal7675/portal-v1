import LoginForm from '@/components/LoginForm';
import { Suspense } from 'react';

export default function LoginPage() {
  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-12 bg-white" suppressHydrationWarning>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.1),transparent)] pointer-events-none" />
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-white rounded-2xl p-8 border border-slate-100 shadow-xl flex items-center justify-center min-h-[300px]">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
