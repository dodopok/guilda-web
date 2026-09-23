export interface Toast { id: number, text: string, kind: 'ok' | 'error' }

let seq = 0
export function useToast() {
  const toasts = useState<Toast[]>('toasts', () => [])
  function push(text: string, kind: Toast['kind'] = 'ok', ms = 4500) {
    const id = ++seq
    toasts.value = [...toasts.value, { id, text, kind }]
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, kind === 'error' ? ms + 3000 : ms)
  }
  return {
    toasts,
    ok: (text: string) => push(text, 'ok'),
    error: (e: unknown, fallback?: string) => push(typeof e === 'string' ? e : apiErrorMessage(e, fallback), 'error'),
  }
}
