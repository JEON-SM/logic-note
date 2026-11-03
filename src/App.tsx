import { lazy, Suspense, useEffect } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useRoute, useTheme } from './lib/store'
import { Library } from './library/Library'
import { DialogHost } from './ui/Dialogs'
import { SettingsDialog } from './ui/Settings'
import { ImportDialog } from './ui/ImportDialog'
import { Toast } from './ui/Toast'
import { EASE } from './ui/kit'

const Editor = lazy(() => import('./editor/Editor'))

export default function App() {
  const route = useRoute()
  const theme = useTheme()
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#111112' : '#F7F7F5')
  }, [theme])
  return (
    <MotionConfig reducedMotion="user">
      {/* 노트를 열면 살짝 커지며 나타나고, 닫으면 목록이 다시 떠오른다 */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={route.name === 'note' ? route.id : 'library'} className="route"
          initial={{ opacity: 0, scale: route.name === 'note' ? 0.97 : 1.02 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: EASE }}>
          {route.name === 'note'
            ? <Suspense fallback={<div className="editor" />}><Editor key={route.id} id={route.id} /></Suspense>
            : <Library route={route} />}
        </motion.div>
      </AnimatePresence>
      <DialogHost />
      <SettingsDialog />
      <ImportDialog />
      <Toast />
    </MotionConfig>
  )
}
