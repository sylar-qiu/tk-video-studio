import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export interface FilterSelectOption {
  value: string
  label: string
  selectedCount: number
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: FilterSelectOption[]
  disabled?: boolean
}

const MENU_MAX_HEIGHT = 280

export default function FilterSelect({ value, onChange, options, disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const selected = options.find((o) => o.value === value) ?? options[0]

  const updateMenuPosition = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow
    const maxHeight = Math.min(
      MENU_MAX_HEIGHT,
      Math.max(120, openUp ? spaceAbove : spaceBelow),
    )
    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      top: openUp ? rect.top - maxHeight - 4 : rect.bottom + 4,
      maxHeight,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    updateMenuPosition()
    const onReflow = () => updateMenuPosition()
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, options.length])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if ((target as Element).closest?.('.filter-select-menu')) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const menu = open ? (
    <div className="filter-select-menu filter-select-menu--portal" style={menuStyle} role="listbox">
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
  ) : null

  return (
    <div className="filter-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="filter-select-trigger input"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev)
        }}
      >
        <span className="filter-select-trigger-label">{selected?.label ?? ''}</span>
        {selected && selected.selectedCount > 0 && (
          <span className="filter-select-selected-count">{selected.selectedCount}</span>
        )}
        <span className="filter-select-chevron" aria-hidden />
      </button>
      {menu && createPortal(menu, document.body)}
    </div>
  )
}
