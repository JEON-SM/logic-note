import { AnimatePresence, motion } from 'motion/react'
import { create } from 'zustand'

const useToast = create<{ msg: string | null; n: number }>(() => ({ msg: null, n: 0 }))
let timer: ReturnType<typeof setTimeout>

/** 화면 아래에 잠깐 뜨는 짧은 알림 */
export function toast(msg: string) {
  clearTimeout(timer)
  useToast.setState((s) => ({ msg, n: s.n + 1 }))
  timer = setTimeout(() => useToast.setState({ msg: null }), 2600)
}

export function Toast() {
  const { msg, n } = useToast()
  return (
    <AnimatePresence>
      {msg && (
        <motion.div key={n} className="toast" role="status" style={{ x: '-50%' }}
          initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
