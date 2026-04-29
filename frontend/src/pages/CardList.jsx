import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getCards, getFilters } from '../api'
import { useProfileStore, useDeckStore, useFilterStore, canAddCard, MAX_COPIES } from '../store'
import { getColorStyle, getKeywords, scoreColor, RARITY_STYLES, TYPE_ICON } from '../utils'
import { CardImageTooltip } from '../components/CardImageTooltip'
import { MultiSelect } from '../components/MultiSelect'
import { SortHeader } from '../components/SortHeader'
import { DeckBuilderBar } from '../components/DeckBuilderBar'
import clsx from 'clsx'

const COLUMNS = [
  { key: 'score',     label: 'Score',   align: 'left',   numeric: true },
  { key: 'cardno',    label: 'Card No', align: 'left',   numeric: false },
  { key: 'name',      label: 'Name',    align: 'left',   numeric: false },
  { key: 'card_type', label: 'Type',    align: 'left',   numeric: false },
  { key: 'color',     label: 'Color',   align: 'left',   numeric: false },
  { key: 'level',     label: 'Lvl',     align: 'center', numeric: true },
  { key: 'cost',      label: 'Cost',    align: 'center', numeric: true },
  { key: 'ap',        label: 'AP',      align: 'center', numeric: true },
  { key: 'hp',        label: 'HP',      align: 'center', numeric: true },
  { key: 'rarity',    label: 'Rarity',  align: 'left',   numeric: false },
  { key: 'keywords',  label: 'Keywords',align: 'left',   numeric: false, nosort: true },
  { key: 'deck',      label: 'Deck',    align: 'center', numeric: false, nosort: true },
]

export default function CardList() {
  const { getActiveWeights }                           = useProfileStore()
  const { getMetaCardnos, activeDeckId, decks,
          addCard, removeCard }                        = useDeckStore()
  const {
    search, types, colors, sets, levels, costs, traits,
    sortKey, sortDir,
    setSearch, setTypes, setColors, setSets, setLevels, setCosts, setTraits,
    setSortKey, setSortDir, clearAll,
  } = useFilterStore()

  const [cards, setCards]         = useState([])
  const [allCards, setAll]        = useState([])
  const [filterOpts, setOpts]     = useState({ types:[], colors:[], sets:[], traits:[] })
  const [loading, setLoading]     = useState(true)
  const [deckError, setDeckError] = useState(null)

  const weightsKey = JSON.stringify(getActiveWeights())
  const metaKey    = JSON.stringify(getMetaCardnos())
  const activeDeck = activeDeckId ? decks[activeDeckId] : null

  useEffect(() => { getFilters().then(setOpts) }, [])

  const fetchAll = useCallback(() => {
    setLoading(true)
    getCards({}, getActiveWeights(), getMetaCardnos())
      .then(data => setAll(data))
      .finally(() => setLoading(false))
  }, [weightsKey, metaKey])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Client-side filter + sort
  useEffect(() => {
    let filtered = allCards

    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.effect || '').toLowerCase().includes(q) ||
        (c.trait || '').toLowerCase().includes(q) ||
        (c.cardno || '').toLowerCase().includes(q) ||
        getKeywords(c).some(k => k.label.toLowerCase().includes(q))
      )
    }
    if (types.length)  filtered = filtered.filter(c => types.includes(c.card_type))
    if (colors.length) filtered = filtered.filter(c => colors.includes(c.color))
    if (sets.length)   filtered = filtered.filter(c => sets.includes(c.set_code))
    if (levels.length) filtered = filtered.filter(c => c.level != null && levels.includes(String(c.level)))
    if (costs.length)  filtered = filtered.filter(c => c.cost  != null && costs.includes(String(c.cost)))
    if (traits.length) filtered = filtered.filter(c => {
      if (!c.trait) return false
      const cardTraits = c.trait.split('/').map(t => t.trim())
      return traits.some(t => cardTraits.includes(t))
    })

    filtered = [...filtered].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey]
      if (sortKey === 'keywords') { av = getKeywords(a).length; bv = getKeywords(b).length }
      if (av == null) av = sortDir === 'asc' ? Infinity : -Infinity
      if (bv == null) bv = sortDir === 'asc' ? Infinity : -Infinity
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })

    setCards(filtered)
  }, [allCards, search, types, colors, sets, levels, costs, traits, sortKey, sortDir])

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(COLUMNS.find(c => c.key === key)?.numeric ? 'desc' : 'asc') }
  }

  const handleAddCard = (card) => {
    if (!activeDeckId) { setDeckError('Select or create a deck first'); return }
    const check = canAddCard(activeDeck?.entries || [], card)
    if (!check.ok) { setDeckError(check.reason); return }
    addCard(activeDeckId, card)
    setDeckError(null)
  }

  const handleRemoveCard = (cardno) => {
    if (!activeDeckId) return
    removeCard(activeDeckId, cardno)
  }

  const getDeckCount = (cardno) => {
    if (!activeDeck) return 0
    return activeDeck.entries.find(e => e.cardno === cardno)?.count || 0
  }

  // Level and cost options 1-8
  const levelOpts = ['1','2','3','4','5','6','7','8']
  const costOpts  = ['1','2','3','4','5','6','7','8']

  return (
    <div className="animate-fade-in">
      {/* Deck builder bar */}
      <DeckBuilderBar error={deckError} onClearError={() => setDeckError(null)} />

      {/* Filters */}
      <div className="card-surface p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gundam-dim font-mono">SEARCH</label>
          <input className="input-base w-56" placeholder="Name, effect, keyword..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <MultiSelect label="TYPE"  options={filterOpts.types}  selected={types}  onChange={setTypes} />
        <MultiSelect label="COLOR" options={filterOpts.colors} selected={colors} onChange={setColors} />
        <MultiSelect label="SET"   options={filterOpts.sets}   selected={sets}   onChange={setSets} />
        <MultiSelect label="LEVEL" options={levelOpts}         selected={levels} onChange={setLevels} />
        <MultiSelect label="COST"  options={costOpts}          selected={costs}  onChange={setCosts} />
        <MultiSelect label="TRAIT" options={filterOpts.traits}  selected={traits} onChange={setTraits} />
        <button onClick={clearAll} className="btn-ghost self-end">Clear</button>
        <span className="ml-auto self-end text-sm text-gundam-dim font-mono">
          {loading ? '…' : `${cards.length} / ${allCards.length} cards`}
        </span>
      </div>

      {/* Table */}
      <div className="card-surface" style={{ overflow: 'visible' }}>
        <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gundam-border bg-gundam-surface">
                {COLUMNS.map(col => (
                  <SortHeader key={col.key} colKey={col.key} label={col.label}
                    sortKey={sortKey} sortDir={sortDir}
                    onSort={col.nosort ? () => {} : handleSort} align={col.align} />
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 12 }).map((_, i) => (
                    <tr key={i} className="border-b border-gundam-border/50">
                      {COLUMNS.map((_, j) => (
                        <td key={j} className="px-3 py-3"><div className="h-4 bg-gundam-border/30 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : cards.map((card, i) => {
                    const cs       = getColorStyle(card.color)
                    const kws      = getKeywords(card)
                    const deckCount = getDeckCount(card.cardno)
                    const atMax    = deckCount >= MAX_COPIES
                    const canAdd   = activeDeckId && !atMax
                    return (
                      <tr key={card.cardno}
                        className={clsx('border-b border-gundam-border/50 hover:bg-gundam-surface/60 transition-colors', i%2===0?'':'bg-white/[0.01]')}
                        style={{ overflow: 'visible' }}>
                        <td className="px-3 py-2.5 font-mono font-medium">
                          <span className={scoreColor(card.score)}>{card.score?.toFixed(1)}</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-gundam-dim whitespace-nowrap">{card.cardno}</td>
                        <td style={{ padding: '6px 12px', fontWeight: 500, position: 'relative', overflow: 'visible' }}>
                          <Link to={`/card/${encodeURIComponent(card.cardno)}`}
                            style={{ color: 'inherit', textDecoration: 'none' }}>
                            <CardImageTooltip cardno={card.cardno} name={card.name} fixedPosition={true} />
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-gundam-dim text-xs">{TYPE_ICON[card.card_type]} {card.card_type}</td>
                        <td className="px-3 py-2.5">
                          {card.color && <span className={clsx('tag', cs.bg, cs.text, cs.border, 'border')}>{card.color}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-xs">{card.level ?? '—'}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-xs">{card.cost ?? '—'}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-xs font-medium text-red-400">{card.ap ?? '—'}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-xs font-medium text-green-400">{card.hp ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className={clsx('tag', RARITY_STYLES[card.rarity] || 'text-gundam-dim')}>{card.rarity}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {kws.map(k => <span key={k.label} className={clsx('tag', k.color)}>{k.label}</span>)}
                          </div>
                        </td>
                        {/* Deck +/- controls */}
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-1 justify-center">
                            <button
                              onClick={() => handleRemoveCard(card.cardno)}
                              disabled={deckCount === 0}
                              className={clsx(
                                'w-6 h-6 rounded text-sm font-bold transition-colors flex items-center justify-center',
                                deckCount > 0
                                  ? 'bg-gundam-surface hover:bg-red-900 text-gundam-text border border-gundam-border'
                                  : 'opacity-20 cursor-not-allowed bg-gundam-surface border border-gundam-border text-gundam-dim'
                              )}
                            >−</button>
                            <span className={clsx(
                              'w-5 text-center text-xs font-mono font-bold',
                              deckCount > 0 ? 'text-gundam-accent' : 'text-gundam-muted'
                            )}>
                              {deckCount || ''}
                            </span>
                            <button
                              onClick={() => handleAddCard(card)}
                              disabled={!canAdd}
                              className={clsx(
                                'w-6 h-6 rounded text-sm font-bold transition-colors flex items-center justify-center',
                                canAdd
                                  ? 'bg-gundam-surface hover:bg-green-900 text-gundam-text border border-gundam-border'
                                  : 'opacity-20 cursor-not-allowed bg-gundam-surface border border-gundam-border text-gundam-dim'
                              )}
                            >+</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
