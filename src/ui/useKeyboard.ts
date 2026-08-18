import { useEffect } from 'react'
import { useMediaStore } from '../store/useMediaStore'
import { useParamsStore } from '../store/useParamsStore'
import { useExportStore } from '../store/useExportStore'
import { allPresets, applyPreset, usePresetStore } from '../store/usePresetStore'
import { videoEngine } from '../media/VideoEngine'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/**
 * Klavye: Space oynat/duraklat · ←/→ kare (Shift: 10 kare) · Home/End in-out ·
 * I/O in-out işaretle · L döngü · M maske · \ basılı tutunca ham video ·
 * R sıfırla · Ctrl+Z / Ctrl+Shift+Z geri/ileri.
 */
export function useKeyboard() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      if (e.key === 'Escape') {
        useExportStore.getState().setOpen(false)
        usePresetStore.getState().setPickerOpen(false)
        return
      }
      const media = useMediaStore.getState()
      const params = useParamsStore.getState()
      const ready = media.status === 'ready'

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) params.redo()
        else params.undo()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return

      switch (e.key) {
        case ' ':
          if (!ready) return
          e.preventDefault()
          void videoEngine.toggle()
          break
        case 'ArrowLeft':
          if (!ready) return
          e.preventDefault()
          void videoEngine.step(e.shiftKey ? -10 : -1)
          break
        case 'ArrowRight':
          if (!ready) return
          e.preventDefault()
          void videoEngine.step(e.shiftKey ? 10 : 1)
          break
        case 'Home':
          if (!ready) return
          e.preventDefault()
          void videoEngine.seek(media.inPoint)
          break
        case 'End':
          if (!ready) return
          e.preventDefault()
          void videoEngine.seek(Math.max(media.inPoint, media.outPoint - 1 / media.fps))
          break
        case '\\':
          if (!media.showRaw) media.setShowRaw(true)
          break
        default:
          break
      }

      switch (e.key.toLowerCase()) {
        case 'm':
          media.setMaskPreview(!media.maskPreview)
          break
        case 'l':
          media.setLoop(!media.loop)
          break
        case 'i':
          if (ready) media.setRange(Math.min(media.currentTime, media.outPoint - 1 / media.fps), media.outPoint)
          break
        case 'o':
          if (ready) media.setRange(media.inPoint, Math.max(media.currentTime, media.inPoint + 1 / media.fps))
          break
        case 'r':
          params.resetAll()
          break
        case 'e':
          if (ready) useExportStore.getState().setOpen(true)
          break
        case 'p':
          usePresetStore.getState().setPickerOpen(!usePresetStore.getState().pickerOpen)
          break
        default:
          break
      }

      // 1–9: preset uygula
      if (e.key >= '1' && e.key <= '9') {
        const presets = allPresets(usePresetStore.getState().user)
        const preset = presets[Number(e.key) - 1]
        if (preset) applyPreset(preset)
      }

    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === '\\') useMediaStore.getState().setShowRaw(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])
}
