import { useRef, useState } from 'react'
import { Bookmark, Check, ChevronDown, Link2, Upload } from 'lucide-react'
import { BUILTIN_PRESETS } from '../presets/presets'
import { shareUrl, usePresetStore } from '../store/usePresetStore'
import { useParamsStore } from '../store/useParamsStore'

/**
 * Preset çubuğu — aktif preseti gösterir, seçici pencereyi açar.
 * Kaydet / paylaş / JSON içe-dışa aktar buradan. Preset listesi
 * `PresetPicker` içinde (kategorili, önizlemeli).
 */
export function PresetBar() {
  const user = usePresetStore((s) => s.user)
  const save = usePresetStore((s) => s.save)
  const importJson = usePresetStore((s) => s.importJson)
  const exportJson = usePresetStore((s) => s.exportJson)
  const setPickerOpen = usePresetStore((s) => s.setPickerOpen)
  const params = useParamsStore((s) => s.params)
  const activePreset = useParamsStore((s) => s.activePreset)
  const fileRef = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState<string | null>(null)

  const flash = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 1800)
  }

  const total = BUILTIN_PRESETS.length + user.length
  const active = [...BUILTIN_PRESETS, ...user].find((p) => p.id === activePreset)

  return (
    <div className="border-b border-line px-3 py-2">
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        title="Preset seç (P)"
        className="flex h-8 w-full items-center gap-2 rounded-[2px] bg-ink-3 px-2 text-left hover:bg-ink-4"
      >
        <span className="text-[9px] tracking-[0.16em] text-dim">PRESET</span>
        <span className={`truncate text-[11px] ${active ? 'text-[var(--accent-ui)]' : 'text-fg-soft'}`}>
          {active ? active.name : 'özel ayar'}
        </span>
        <span className="tabnum ml-auto text-[9px] text-dim">{total}</span>
        <ChevronDown size={12} className="text-dim" />
      </button>

      <div className="mt-1 flex items-center gap-1">
        <ActionButton
          label="Mevcut ayarları preset olarak kaydet"
          onClick={() => {
            const name = prompt('Preset adı:')
            if (!name) return
            save(name.trim().slice(0, 40), params)
            flash('Preset kaydedildi')
          }}
        >
          <Bookmark size={10} /> KAYDET
        </ActionButton>
        <ActionButton
          label="Paylaşılabilir bağlantıyı kopyala (parametreler URL'de, sunucu yok)"
          onClick={() => {
            const url = shareUrl(params)
            void navigator.clipboard
              .writeText(url)
              .then(() => flash('Bağlantı kopyalandı'))
              .catch(() => {
                location.hash = url.split('#')[1] ?? ''
                flash('Bağlantı adres çubuğunda')
              })
          }}
        >
          <Link2 size={10} /> PAYLAŞ
        </ActionButton>
        <ActionButton
          label="Kullanıcı presetlerini JSON olarak indir"
          onClick={() => {
            const blob = new Blob([exportJson()], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'blobtrack-presets.json'
            a.click()
            setTimeout(() => URL.revokeObjectURL(url), 5000)
          }}
        >
          JSON ↓
        </ActionButton>
        <ActionButton label="JSON preset dosyası içe aktar" onClick={() => fileRef.current?.click()}>
          <Upload size={10} /> ↑
        </ActionButton>
        {toast && (
          <span className="ml-auto flex items-center gap-1 text-[9px] text-[var(--accent-ui)]">
            <Check size={10} />
            {toast}
          </span>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          const result = importJson(await file.text())
          flash(result.message)
        }}
      />
    </div>
  )
}

function ActionButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="flex items-center gap-1 rounded-[2px] bg-ink-2 px-2 py-1 text-[9px] tracking-[0.1em] text-dim hover:bg-ink-3 hover:text-fg-soft"
    >
      {children}
    </button>
  )
}
