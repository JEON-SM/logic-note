import { lazy, Suspense, useEffect } from 'react'
import { useRoute, useTheme } from './lib/store'
import { Library } from './library/Library'
import { DialogHost } from './ui/Dialogs'
import { SettingsDialog } from './ui/Settings'

const Editor = lazy(() => import('./editor/Editor'))

export default function App() {
  const route = useRoute()
  const theme = useTheme()
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#111112' : '#F7F7F5')
  }, [theme])
  return (
    <>
      {route.name === 'note'
        ? <Suspense fallback={<div className="editor" />}><Editor key={route.id} id={route.id} /></Suspense>
        : <Library route={route} />}
      <DialogHost />
      <SettingsDialog />
    </>
  )
}
