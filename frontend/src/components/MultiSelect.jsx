import { useState, useEffect, useRef } from 'react'
import clsx from 'clsx'

export function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (val) => {
    if (selected.includes(val)) onChange(selected.filter(v => v !== val))
    else onChange([...selected, val])
  }

  const displayLabel = selected.length === 0
    ? 'All'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`

  return (
    <div className="flex flex-col gap-1" ref={ref}>
      <label className="text-xs text-gundam-dim font-mono">{label}</label>
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className={clsx(
            'input-base flex items-center justify-between gap-2 min-w-[130px] text-left',
            open && 'border-gundam-accent'
          )}
        >
          <span className={selected.length ? 'text-gundam-text' : 'text-gundam-muted'}>{displayLabel}</span>
          <span className="text-gundam-dim text-xs">{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <div className="absolute z-50 top-full mt-1 w-full min-w-[160px] bg-gundam-card border border-gundam-border rounded shadow-xl">
            <button
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-2 text-xs text-gundam-dim hover:bg-gundam-surface transition-colors"
            >
              Clear all
            </button>
            <div className="border-t border-gundam-border" />
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gundam-surface cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="accent-gundam-accent"
                />
                <span className="text-xs text-gundam-text">{opt}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
