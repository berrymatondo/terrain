'use client'

import { useEffect, useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'

const OPTIONS: [Theme, string, React.ElementType][] = [
  ['light', 'Clair', Sun],
  ['dark', 'Sombre', Moon],
  ['system', 'Système', Monitor],
]

/**
 * Script exécuté avant l'affichage (voir app/layout.tsx) pour appliquer le thème
 * enregistré sans flash de la page en clair.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}')||'light';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'dark' || stored === 'system' ? stored : 'light'
  } catch {
    return 'light'
  }
}

function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => setTheme(readTheme()), [])

  // En mode « Système », on suit les changements de préférence du système.
  useEffect(() => {
    if (theme !== 'system') return
    const media = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  function choose(next: Theme) {
    setTheme(next)
    applyTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {}
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
