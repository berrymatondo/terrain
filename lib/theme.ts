export type Theme = 'light' | 'dark' | 'system'

/** Cookie du thème choisi, lu par app/layout.tsx pour rendre directement la bonne classe. */
export const THEME_COOKIE = 'theme'

export function parseTheme(value: string | undefined): Theme {
  return value === 'dark' || value === 'system' ? value : 'light'
}
