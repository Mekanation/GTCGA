import { useState, useRef, useEffect } from 'react'
import { useDeckStore, getDeckColors, getDeckCardCount, MAX_DECK_SIZE, MAX_COPIES, canAddCard, exportDeckText } from '../store'
import { CardImageTooltip } from './CardImageTooltip'
import clsx from 'clsx'

const TYPE_COLORS = { Unit: '#60a5fa', Pilot: '#fb923c', Command: '#c084fc', Base: '#4ade80' }
const TYPES = ['Unit', 'Pilot', 'Command', 'Base']

function getCardType(entry) {
  // Builder decks store full card on entry.card
  // Import decks may have card_type directly on entry
  return entry.card?.card_type || entry.card_type || null
}

function getTypeCounts(entries, resultCards) {
  const counts = { Unit: 0, Pilot: 0, Command: 0, Base: 0 }
  // Build a lookup from analyzer result if available (covers imported decks)
  const resultMap = {}
  if (resultCards) {
    resultCards.forEach(rc => { resultMap[rc.cardno] = rc.card_type })
  }
  ;(entries || []).forEach(e => {
    const t = getCardType(e) || resultMap[e.cardno] || null
    if (t && counts[t] !== undefined) counts[t] += e.count
  })
  return counts
}

// ── Current vs Meta pill tooltip ───────────────────────────────────────────────
function MetaStatsTooltip({ deck }) {
  const { getAllDecks } = useDeckStore()
  const allDecks   = getAllDecks()
  const metaDecks  = allDecks.filter(d => d.id !== deck?.id && getDeckCardCount(d.entries) > 0)
  const deckCounts = getTypeCounts(deck?.entries || [], deck?.result?.cards)

  // Average type counts across all OTHER decks
  const metaAvg = { Unit: 0, Pilot: 0, Command: 0, Base: 0 }
  if (metaDecks.length > 0) {
    metaDecks.forEach(d => {
      const tc = getTypeCounts(d.entries, d.result?.cards)
      TYPES.forEach(t => { metaAvg[t] += tc[t] })
    })
    TYPES.forEach(t => { metaAvg[t] = Math.round((metaAvg[t] / metaDecks.length) * 10) / 10 })
  }

  const totalCurrent = getDeckCardCount(deck?.entries || [])

  return (
    <div style={{
      position:   'absolute',
      top:        'calc(100% + 8px)',
      right:      0,
      zIndex:     9999,
      width:      320,
      background: '#12121c',
      border:     '1px solid #3a3a5a',
      borderRadius: 10,
      padding:    '12px 14px',
      boxShadow:  '0 8px 32px rgba(0,0,0,0.85)',
      fontFamily: 'monospace',
    }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10,
                    paddingBottom:8, borderBottom:'1px solid #2a2a4a' }}>
        <span style={{ fontSize:10, color:'#a0a0c0', letterSpacing:'0.08em' }}>CURRENT</span>
        <span style={{ fontSize:10, color:'#5050a0', letterSpacing:'0.06em' }}>
          META AVG {metaDecks.length > 0 ? `(${metaDecks.length} decks)` : '— no other decks'}
        </span>
      </div>

      {/* Type rows */}
      {TYPES.map(t => {
        const curr = deckCounts[t]
        const meta = metaAvg[t]
        const diff = curr - meta
        const hasMeta = metaDecks.length > 0
        return (
          <div key={t} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <span style={{ fontSize:11, color: TYPE_COLORS[t], width:64, flexShrink:0 }}>{t}</span>
            {/* Current bar */}
            <div style={{ flex:1, height:6, background:'#1e1e30', borderRadius:3, overflow:'hidden' }}>
              <div style={{
                height:'100%', borderRadius:3,
                background: TYPE_COLORS[t] + '99',
                width: `${Math.min(100, (curr / Math.max(totalCurrent, 1)) * 100)}%`,
              }}/>
            </div>
            <span style={{ fontSize:12, fontWeight:700, color:'#e2e2f0', width:22, textAlign:'right' }}>{curr}</span>
            <span style={{ fontSize:10, color:'#3a3a6a', width:8, textAlign:'center' }}>|</span>
            <span style={{ fontSize:11, color: hasMeta ? '#8080a0' : '#3a3a6a', width:28, textAlign:'right' }}>
              {hasMeta ? meta.toFixed(1) : '—'}
            </span>
            {hasMeta && Math.abs(diff) >= 0.5 && (
              <span style={{
                fontSize:10, fontWeight:700, width:32, textAlign:'right',
                color: diff > 0 ? '#4ade80' : '#f87171',
              }}>
                {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}
              </span>
            )}
          </div>
        )
      })}

      {/* Total */}
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:10,
                    paddingTop:8, borderTop:'1px solid #2a2a4a' }}>
        <span style={{ fontSize:10, color:'#6060a0' }}>TOTAL CARDS</span>
        <span style={{
          fontSize:12, fontWeight:700,
          color: totalCurrent >= MAX_DECK_SIZE ? '#f87171' : '#e2e2f0',
        }}>{totalCurrent} / {MAX_DECK_SIZE}</span>
      </div>

      {/* Curve section */}
      {(metaDecks.length > 0 || deck) && (() => {
        // Compute level curves — only Unit cards count for curve
        const levels = [1,2,3,4,5,6,7,8]

        // Helper: get level and type from entry, falling back to result.cards lookup
        const makeResultMap = (d) => {
          const m = {}
          ;(d.result?.cards || []).forEach(rc => { m[rc.cardno] = rc })
          return m
        }

        // Current deck curve
        const deckResultMap = makeResultMap(deck || {})
        const deckCurve = {}
        levels.forEach(l => { deckCurve[l] = 0 })
        ;(deck?.entries || []).forEach(e => {
          const rc = e.card || deckResultMap[e.cardno] || {}
          const lv = rc.level ?? rc.level
          const t  = rc.card_type
          if (lv != null && t === 'Unit' && deckCurve[lv] !== undefined) deckCurve[lv] += e.count
        })

        // Meta avg curve
        const metaCurve = {}
        levels.forEach(l => { metaCurve[l] = 0 })
        if (metaDecks.length > 0) {
          metaDecks.forEach(d => {
            const rm = makeResultMap(d)
            ;(d.entries || []).forEach(e => {
              const rc = e.card || rm[e.cardno] || {}
              const lv = rc.level
              const t  = rc.card_type
              if (lv != null && t === 'Unit' && metaCurve[lv] !== undefined) metaCurve[lv] += e.count
            })
          })
          levels.forEach(l => { metaCurve[l] = Math.round((metaCurve[l] / metaDecks.length) * 10) / 10 })
        }

        const maxVal = Math.max(
          ...levels.map(l => deckCurve[l]),
          ...levels.map(l => metaCurve[l]),
          1
        )

        const hasAny = levels.some(l => deckCurve[l] > 0 || metaCurve[l] > 0)
        if (!hasAny) return null

        return (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #2a2a4a' }}>
            <div style={{ fontSize: 10, color: '#a0a0c0', marginBottom: 6, letterSpacing: '0.08em' }}>
              UNIT CURVE
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: '#e8312a', fontFamily: 'monospace' }}>■ Current</span>
              {metaDecks.length > 0 && <span style={{ fontSize: 9, color: '#3a3a6a', fontFamily: 'monospace' }}>■ Meta Avg</span>}
            </div>
            {levels.map(lv => {
              const curr = deckCurve[lv]
              const meta = metaCurve[lv]
              if (curr === 0 && meta === 0) return null
              return (
                <div key={lv} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: '#f5a623', fontFamily: 'monospace', width: 28, flexShrink: 0 }}>
                    Lv.{lv}
                  </span>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Current bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ flex: 1, height: 6, background: '#1e1e30', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 3,
                          background: '#e8312a',
                          width: `${Math.min(100, (curr / maxVal) * 100)}%`,
                          transition: 'width 0.2s',
                        }}/>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#e2e2f0', width: 16, textAlign: 'right', flexShrink: 0 }}>{curr}</span>
                    </div>
                    {/* Meta bar */}
                    {metaDecks.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ flex: 1, height: 4, background: '#1e1e30', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 3,
                            background: '#3a3a6a',
                            width: `${Math.min(100, (meta / maxVal) * 100)}%`,
                          }}/>
                        </div>
                        <span style={{ fontSize: 9, color: '#6060a0', width: 16, textAlign: 'right', flexShrink: 0 }}>{meta > 0 ? meta.toFixed(1) : '—'}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Arrow */}
      <div style={{
        position:'absolute', top:'-7px', right:16,
        width:0, height:0,
        borderLeft:'6px solid transparent', borderRight:'6px solid transparent',
        borderBottom:'7px solid #3a3a5a',
      }}/>
    </div>
  )
}


// ── Deck accordion panel ─────────────────────────────────────────────────────
const ACC_COLS = [
  { key: 'name',      label: 'Name',   numeric: false },
  { key: 'card_type', label: 'Type',   numeric: false },
  { key: 'color',     label: 'Color',  numeric: false },
  { key: 'level',     label: 'Lvl',    numeric: true  },
  { key: 'cost',      label: 'Cost',   numeric: true  },
  { key: 'ap',        label: 'AP',     numeric: true  },
  { key: 'hp',        label: 'HP',     numeric: true  },
  { key: 'link_pilot',label: 'Link',   numeric: false },
  { key: 'trait',     label: 'Trait',  numeric: false },
  { key: 'count',     label: '×',      numeric: true  },
  { key: 'controls',  label: '',       numeric: false, nosort: true },
]

const TYPE_ICON = { Unit:'⚡', Pilot:'👤', Command:'📜', Base:'🏛', 'EX Base':'🛡' }
const COLOR_HEX2 = {
  Blue:'#60a5fa', Green:'#4ade80', Red:'#f87171',
  White:'#e2e2f0', Purple:'#c084fc', Yellow:'#fbbf24', Multi:'#67e8f9',
}

function DeckAccordion({ deck }) {
  const { removeCard, addCard } = useDeckStore()
  const [sortKey, setSortKey] = useState('card_type')
  const [sortDir, setSortDir] = useState('asc')

  const total = getDeckCardCount(deck.entries || [])

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(ACC_COLS.find(c => c.key === key)?.numeric ? 'desc' : 'asc') }
  }

  // Build sortable rows from entries
  const rows = [...(deck.entries || [])].map(e => ({
    ...e,
    name:       e.card?.name        || e.cardno,
    card_type:  e.card?.card_type   || '',
    color:      e.card?.color       || '',
    level:      e.card?.level       ?? null,
    cost:       e.card?.cost        ?? null,
    ap:         e.card?.ap          ?? null,
    hp:         e.card?.hp          ?? null,
    link_pilot: e.card?.link_pilot  || '',
    trait:      e.card?.trait       || '',
  }))

  rows.sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey]
    if (av == null) av = sortDir === 'asc' ? Infinity : -Infinity
    if (bv == null) bv = sortDir === 'asc' ? Infinity : -Infinity
    if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
    return sortDir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av))
  })

  const thStyle = (col) => ({
    padding: '6px 8px',
    fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.08em',
    color: sortKey === col.key ? '#e8312a' : '#5050a0',
    cursor: col.nosort ? 'default' : 'pointer',
    userSelect: 'none',
    borderBottom: '1px solid #2a2a3a',
    textAlign: col.numeric ? 'center' : 'left',
    whiteSpace: 'nowrap',
    background: '#0e0e1a',
  })

  const tdStyle = (align = 'left') => ({
    padding: '5px 8px',
    fontSize: 10,
    borderBottom: '1px solid #1a1a2a',
    verticalAlign: 'middle',
    textAlign: align,
  })

  return (
    <div style={{
      background: '#0e0e1a',
      border: '1px solid #2a2a3a',
      borderTop: 'none',
      borderRadius: '0 0 8px 8px',
      marginBottom: 12,
      overflow: 'hidden',
      animation: 'slideDown 0.15s ease',
    }}>
      <style>{`@keyframes slideDown { from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:translateY(0) } }`}</style>

      {rows.length === 0 ? (
        <div style={{ color: '#4a4a6a', fontSize: 12, fontFamily: 'monospace', textAlign: 'center', padding: '16px 0' }}>
          No cards yet — use + buttons in the card list below
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr>
                {ACC_COLS.map(col => (
                  <th key={col.key} style={thStyle(col)} onClick={() => !col.nosort && handleSort(col.key)}>
                    {col.label}
                    {!col.nosort && (
                      <span style={{ marginLeft: 3, opacity: 0.5 }}>
                        {sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const linkInDeck = row.link_pilot
                  ? deck.entries.some(de => (de.card?.name || '').toLowerCase().includes(row.link_pilot.toLowerCase()))
                  : true
                const traitParts = row.trait ? row.trait.split('/').map(t => t.trim()) : []
                const bg = i % 2 === 0 ? '#0e0e1a' : '#111120'

                return (
                  <tr key={row.cardno} style={{ background: bg }}>
                    {/* Name with image hover */}
                    <td style={{ ...tdStyle(), position: 'relative', overflow: 'visible', maxWidth: 180 }}>
                      <span style={{ fontSize: 10, color: '#c0c0e0', whiteSpace: 'nowrap', overflow: 'hidden',
                                     textOverflow: 'ellipsis', display: 'block', maxWidth: 170 }}>
                        <CardImageTooltip cardno={row.cardno} name={row.name} fixedPosition={true} />
                      </span>
                      <span style={{ fontSize: 8, color: '#4a4a7a', fontFamily: 'monospace' }}>{row.cardno}</span>
                    </td>

                    {/* Type */}
                    <td style={tdStyle()}>
                      <span style={{ fontSize: 10, color: '#7070a0' }}>
                        {TYPE_ICON[row.card_type]} {row.card_type}
                      </span>
                    </td>

                    {/* Color */}
                    <td style={tdStyle()}>
                      {row.color && (
                        <span style={{
                          fontSize: 9, padding: '1px 5px', borderRadius: 3,
                          background: (COLOR_HEX2[row.color] || '#888') + '22',
                          color: COLOR_HEX2[row.color] || '#888',
                          border: `1px solid ${COLOR_HEX2[row.color] || '#888'}44`,
                          fontFamily: 'monospace',
                        }}>{row.color}</span>
                      )}
                    </td>

                    {/* Lvl */}
                    <td style={{ ...tdStyle('center'), color: '#f5a623', fontFamily: 'monospace', fontWeight: 600 }}>
                      {row.level ?? '—'}
                    </td>

                    {/* Cost */}
                    <td style={{ ...tdStyle('center'), color: '#f5a623', fontFamily: 'monospace', fontWeight: 600 }}>
                      {row.cost ?? '—'}
                    </td>

                    {/* AP */}
                    <td style={{ ...tdStyle('center'), color: '#f87171', fontFamily: 'monospace', fontWeight: 600 }}>
                      {row.ap ?? '—'}
                    </td>

                    {/* HP */}
                    <td style={{ ...tdStyle('center'), color: '#4ade80', fontFamily: 'monospace', fontWeight: 600 }}>
                      {row.hp ?? '—'}
                    </td>

                    {/* Link */}
                    <td style={{ ...tdStyle(), maxWidth: 120 }}>
                      {row.link_pilot ? (
                        <span style={{
                          fontSize: 9, fontFamily: 'monospace', whiteSpace: 'nowrap',
                          color: linkInDeck ? '#60a5fa' : '#f87171',
                          fontWeight: linkInDeck ? 400 : 700,
                        }}>
                          {row.link_pilot}
                          {!linkInDeck && <span style={{ marginLeft: 3, fontSize: 8 }}>⚠</span>}
                        </span>
                      ) : <span style={{ color: '#2a2a4a' }}>—</span>}
                    </td>

                    {/* Trait */}
                    <td style={{ ...tdStyle(), maxWidth: 160 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                        {traitParts.map(t => (
                          <span key={t} style={{
                            fontSize: 8, color: '#7070a0', background: '#1a1a2e',
                            border: '1px solid #2a2a4a', borderRadius: 2, padding: '0 3px',
                            fontFamily: 'monospace', whiteSpace: 'nowrap',
                          }}>{t}</span>
                        ))}
                      </div>
                    </td>

                    {/* Count */}
                    <td style={{ ...tdStyle('center'), color: '#e8312a', fontFamily: 'monospace', fontWeight: 700 }}>
                      {row.count}
                    </td>

                    {/* Controls */}
                    <td style={tdStyle('center')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
                        <button onClick={() => removeCard(deck.id, row.cardno)}
                          style={{
                            width: 18, height: 18, borderRadius: 3, border: '1px solid #3a3a5a',
                            background: '#1a1a2e', color: '#e2e2f0', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, lineHeight: 1, fontWeight: 700,
                          }}
                          onMouseOver={e => e.currentTarget.style.background = '#3a1a1a'}
                          onMouseOut={e => e.currentTarget.style.background = '#1a1a2e'}
                        >−</button>
                        <button
                          onClick={() => { if (row.card) addCard(deck.id, row.card) }}
                          disabled={row.count >= MAX_COPIES || total >= MAX_DECK_SIZE}
                          style={{
                            width: 18, height: 18, borderRadius: 3, border: '1px solid #3a3a5a',
                            background: '#1a1a2e', color: '#e2e2f0', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, lineHeight: 1, fontWeight: 700,
                            opacity: (row.count >= MAX_COPIES || total >= MAX_DECK_SIZE) ? 0.25 : 1,
                          }}
                          onMouseOver={ev => { if (row.count < MAX_COPIES) ev.currentTarget.style.background = '#1a3a1a' }}
                          onMouseOut={ev => ev.currentTarget.style.background = '#1a1a2e'}
                        >+</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid #2a2a3a',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#0a0a14' }}>
        <span style={{ fontSize: 10, color: '#5050a0', fontFamily: 'monospace' }}>
          {rows.length} unique · {total}/{MAX_DECK_SIZE} cards
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {['Unit','Pilot','Command','Base'].map(t => {
            const cnt = rows.filter(r => r.card_type === t).reduce((s, r) => s + r.count, 0)
            if (!cnt) return null
            const colors = { Unit:'#60a5fa', Pilot:'#fb923c', Command:'#c084fc', Base:'#4ade80' }
            return (
              <span key={t} style={{ fontSize: 10, color: colors[t], fontFamily: 'monospace' }}>
                {t[0]}: {cnt}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}


// ── Main bar ───────────────────────────────────────────────────────────────────
export function DeckBuilderBar({ error, onClearError }) {
  const { decks, activeDeckId, setActiveDeck, createDeck,
          removeDeck, renameDeck, removeCard, addCard }     = useDeckStore()
  const [showCreate, setShowCreate]  = useState(false)
  const [newName, setNewName]        = useState('')
  const [showMeta, setShowMeta]      = useState(false)
  const [renamingId, setRenamingId]  = useState(null)
  const [renameVal, setRenameVal]    = useState('')
  const [open, setOpen]              = useState(false)
  const inputRef = useRef(null)

  const allDecks   = Object.values(decks).sort((a, b) => b.createdAt - a.createdAt)
  const activeDeck = decks[activeDeckId]
  const deckColors = activeDeck ? getDeckColors(activeDeck.entries) : []
  const deckCount  = activeDeck ? getDeckCardCount(activeDeck.entries) : 0

  useEffect(() => { if (showCreate && inputRef.current) inputRef.current.focus() }, [showCreate])

  const handleCreate = () => {
    const n = newName.trim()
    if (!n) return
    createDeck(n)
    setNewName('')
    setShowCreate(false)
  }

  const handleExport = () => {
    if (!activeDeck) return
    const text = exportDeckText(activeDeck)
    navigator.clipboard?.writeText(text).then(() => alert('Deck copied to clipboard!')).catch(() => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([text], { type:'text/plain' }))
      a.download = activeDeck.name.replace(/[ ]+/g, '_') + '.txt'
      a.click()
    })
  }

  const COLOR_HEX = {
    Blue:'#60a5fa', Green:'#4ade80', Red:'#f87171',
    White:'#e2e2f0', Purple:'#c084fc', Yellow:'#fbbf24', Multi:'#67e8f9',
  }

  return (
  <>
    <div className="card-surface p-3 mb-3 flex flex-wrap items-center gap-3">
      {/* Deck selector */}
      <span className="text-xs font-mono text-gundam-dim">DECK</span>
      <select className="input-base text-sm min-w-[180px]"
        value={activeDeckId || ''}
        onChange={e => setActiveDeck(e.target.value || null)}>
        <option value="">— No deck selected —</option>
        {allDecks.map(d => (
          <option key={d.id} value={d.id}>
            {d.source === 'builder' ? '🔨 ' : '📥 '}{d.name} ({getDeckCardCount(d.entries)}/{MAX_DECK_SIZE})
          </option>
        ))}
      </select>

      {/* Create */}
      {showCreate ? (
        <div className="flex gap-1">
          <input ref={inputRef} className="input-base text-sm w-36" placeholder="Deck name..."
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter') handleCreate(); if (e.key==='Escape') setShowCreate(false) }} />
          <button onClick={handleCreate} className="btn-primary text-xs px-2">✓</button>
          <button onClick={() => setShowCreate(false)} className="btn-ghost text-xs px-2">✕</button>
        </div>
      ) : (
        <button onClick={() => setShowCreate(true)} className="btn-ghost text-xs px-2 py-1" title="New deck">+</button>
      )}

      {/* Active deck info */}
      {activeDeck && (
        <>
          {/* Color chips */}
          <div className="flex gap-1">
            {deckColors.length === 0
              ? <span className="text-xs text-gundam-muted font-mono">No colors yet</span>
              : deckColors.map(c => (
                  <span key={c} style={{
                    background: COLOR_HEX[c] + '22',
                    color: COLOR_HEX[c],
                    border: `1px solid ${COLOR_HEX[c]}55`,
                    padding: '1px 6px', borderRadius: 4, fontSize: 11,
                  }}>{c}</span>
                ))}
          </div>

          {/* Count */}
          <span className={clsx('text-xs font-mono font-bold',
            deckCount >= MAX_DECK_SIZE ? 'text-red-400' : 'text-gundam-text')}>
            {deckCount}/{MAX_DECK_SIZE}
          </span>

          {/* Rename */}
          {renamingId === activeDeckId ? (
            <div className="flex gap-1">
              <input className="input-base text-xs w-32" value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key==='Enter') { renameDeck(activeDeckId, renameVal); setRenamingId(null) }
                  if (e.key==='Escape') setRenamingId(null)
                }} autoFocus />
              <button onClick={() => { renameDeck(activeDeckId, renameVal); setRenamingId(null) }}
                className="btn-ghost text-xs px-1">✓</button>
            </div>
          ) : (
            <button onClick={() => { setRenamingId(activeDeckId); setRenameVal(activeDeck.name) }}
              className="text-xs text-gundam-dim hover:text-gundam-text font-mono" title="Rename">✎</button>
          )}

          {/* Export */}
          <button onClick={handleExport} className="btn-ghost text-xs">↓ Export</button>

          {/* Delete */}
          <button onClick={() => { if (confirm(`Delete "${activeDeck.name}"?`)) removeDeck(activeDeckId) }}
            className="text-xs text-red-500 hover:text-red-400 font-mono">✕ Delete</button>

          {/* Current vs Meta pill */}
          <div className="relative ml-auto"
            onMouseEnter={() => setShowMeta(true)}
            onMouseLeave={() => setShowMeta(false)}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#1a1a2e', border: '1px solid #3a3a5a',
              borderRadius: 20, padding: '3px 10px', cursor: 'default',
              fontSize: 11, fontFamily: 'monospace',
            }}>
              <span style={{ color: '#e2e2f0', fontWeight: 600 }}>Current</span>
              <span style={{ color: '#3a3a6a' }}>|</span>
              <span style={{ color: '#7070a0' }}>Meta</span>
              <span style={{ color: '#5050a0', fontSize: 10, marginLeft: 2 }}>▾</span>
            </button>
            {showMeta && <MetaStatsTooltip deck={activeDeck} />}
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <div className={clsx('flex items-center gap-2', activeDeck ? '' : 'ml-auto')}>
          <span className="text-xs text-red-400 font-mono bg-red-950/40 px-2 py-1 rounded">{error}</span>
          <button onClick={onClearError} className="text-xs text-gundam-dim hover:text-red-400">✕</button>
        </div>
      )}

      {/* Accordion toggle */}
      {activeDeck && (
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#7070a0',
            fontSize: 16,
            padding: '2px 6px',
            borderRadius: 4,
            transition: 'color 0.15s',
            lineHeight: 1,
          }}
          onMouseOver={e => e.currentTarget.style.color = '#e2e2f0'}
          onMouseOut={e => e.currentTarget.style.color = '#7070a0'}
          title={open ? 'Collapse deck list' : 'Expand deck list'}
        >
          {open ? '▲' : '▼'}
        </button>
      )}
    </div>

    {/* Accordion panel */}
    {activeDeck && open && (
      <DeckAccordion deck={activeDeck} onError={e => {}} />
    )}
  </>
  )
}
