'use client'

import { useEffect, useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { parseTheme, THEME_COOKIE, type Theme } from '@/lib/theme'

const OPTIONS: [Theme, string, React.ElementType][] = [
  ['light', 'Clair', Sun],
  ['dark', 'Sombre', Moon],
  ['system', 'Système', Monitor],
]

const prefersDark = () => matchMedia('(prefers-color-scheme: dark)').matches

/** Thème courant, rendu par le serveur dans `data-theme` sur <html> (voir app/layout.tsx). */
function currentTheme() {
  return parseTheme(document.documentElement.dataset.theme)
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('dark', theme === 'dark' || (theme === 'system' && prefersDark()))
}

/**
 * Le serveur ne connaît pas la préférence du système : en mode « Système »,
 * on l'applique au chargement puis on suit ses changements.
 */
export function ThemeSync() {
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const sync = () => {
      if (currentTheme() === 'system') applyTheme('system')
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  return null
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => setTheme(currentTheme()), [])

  function choose(next: Theme) {
    setTheme(next)
    applyTheme(next)
    // Cookie lu par le serveur pour afficher directement le bon thème au rechargement.
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <Menu.Root>
      <Menu.Trigger className={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label="Changer de thème" title="Thème">
        <Sun className="dark:hidden" />
        <Moon className="hidden dark:block" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-50">
          <Menu.Popup className="min-w-40 rounded-xl border border-slate-200 bg-card p-1.5 text-sm shadow-lg outline-none transition-[opacity,transform] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {OPTIONS.map(([value, label, Icon]) => (
              <Menu.Item key={value} onClick={() => choose(value)} className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-highlighted:bg-slate-100">
                <Icon className="size-4 text-slate-500" /> {label}
                {theme === value && <Check className="ml-auto size-4 text-primary" />}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
