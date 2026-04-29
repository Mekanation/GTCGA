import clsx from 'clsx'

export function SortHeader({ label, colKey, sortKey, sortDir, onSort, align = 'left' }) {
  const active = sortKey === colKey
  return (
    <th
      onClick={() => onSort(colKey)}
      className={clsx(
        'px-3 py-3 font-mono text-xs tracking-widest whitespace-nowrap cursor-pointer select-none',
        'hover:text-gundam-text transition-colors',
        active ? 'text-gundam-accent' : 'text-gundam-dim',
        align === 'center' && 'text-center'
      )}
    >
      {label}
      <span className="ml-1 opacity-60">
        {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </th>
  )
}
