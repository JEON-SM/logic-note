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
  return msg ? <div key={n} className="toast" role="status">{msg}</div> : null
}
