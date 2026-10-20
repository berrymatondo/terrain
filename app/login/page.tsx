import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/login-form'
import { getCurrentUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'Connexion | Emergence RDC' }

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/')

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-4 dark:bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground">E</div>
          <div>
            <p className="font-semibold tracking-tight">Emergence RDC</p>
            <p className="text-xs text-muted-foreground">Pilotage commercial</p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Connexion</h1>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">Accédez à votre espace de travail.</p>
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
