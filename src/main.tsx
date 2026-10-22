import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import '@xyflow/react/dist/base.css'
import './styles.css'
import App from './App'
import { initSync } from './lib/sync'
import { seedIfEmpty } from './lib/seed'

registerSW({ immediate: true })
initSync()
seedIfEmpty().finally(() => createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>))
