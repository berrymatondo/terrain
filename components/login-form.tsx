'use client'

import { useState, useTransition } from 'react'
import { login } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'

export function LoginForm() {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await login(formData)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Adresse e-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Connexion…' : 'Se connecter'}
      </Button>
    </form>
  )
}
