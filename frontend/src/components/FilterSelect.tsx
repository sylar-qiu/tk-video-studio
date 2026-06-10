import { useEffect, useRef, useState } from 'react'

export interface FilterSelectOption {
  value: string
  label: string
  selectedCount: number
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: FilterSelectOption[]
}

export default function FilterSelect({ value, onChange, options }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div className="filter-select" ref={rootRef}>
      <button
        type="button"
        className="filter-select-trigger input"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="filter-select-trigger-label">{selected?.label ?? ''}</span>
        {selected && selected.selectedCount > 0 && (
          <span className="filter-select-selected-count">{selected.selectedCount}</span>
        )}
        <span className="filter-select-chevron" aria-hidden />
      </button>
      {open && (
        <div className="filter-select-menu" role="listbox">
          {options.map((opt) => (
            <button
              key={opt.value || '__all__'}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={`filter-select-option${opt.value === value ? ' active' : ''}`}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
            >
              <span className="filter-select-option-label">{opt.label}</span>
              {opt.selectedCount > 0 && (
                <span className="filter-select-selected-count">{opt.selectedCount}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
