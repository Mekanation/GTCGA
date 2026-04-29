import { useState, useEffect, useRef } from 'react'
import { CardImageTooltip } from '../components/CardImageTooltip'
import { ContribCell } from '../components/BreakdownTooltip'
import { analyzeDeck } from '../api'
import { exportDeckText } from '../store'
import { useProfileStore, useDeckStore, parseDeckList } from '../store'
import { getColorStyle, scoreColor } from '../utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import clsx from 'clsx'

const PLACEHOLDER = `// Main Deck
4x ST03-013
4x GD01-118
4x GD01-128
4x GD01-086
2x GD02-079`

export default function DeckAnalyzer() {
  const { getActiveWeights } = useProfileStore()
  const { decks, importDeck, renameDeck, removeDeck, reimportDeck, setDeckResult, getMetaCardnos } = useDeckStore()

  const [selectedId, setSelectedId]   = useState(null)
  const [importText, setImportText]   = useState('')
  const [importName, setImportName]   = useState('')
  const [reimportId, setReimportId]   = useState(null)
  const [reimportText, setReimportText] = useState('')
  const [renamingId, setRenamingId]   = useState(null)
  const [renameVal, setRenameVal]     = useState('')
  const [loading, setLoading]         = useState({})
  const [error, setError]             = useState(null)

  const deckList = Object.values(decks).sort((a,b) => b.importedAt - a.importedAt)
  const selectedDeck = selectedId ? decks[selectedId] : null

  // Re-analyze all decks when weights change
  const weightsRef = useRef(getActiveWeights())
  useEffect(() => {
    const w = getActiveWeights()
    weightsRef.current = w
    reanalyzeAll(w)
  }, [JSON.stringify(getActiveWeights())])

  const reanalyzeAll = async (weights) => {
    const metaCardnos = getMetaCardnos()
    for (const deck of Object.values(decks)) {
      if (!deck.entries.length) continue
      setLoading(l => ({ ...l, [deck.id]: true }))
      try {
        const result = await analyzeDeck(deck.entries, weights, metaCardnos)
        setDeckResult(deck.id, result)
      } catch (e) { /* silent */ }
      finally { setLoading(l => ({ ...l, [deck.id]: false })) }
    }
  }

  const handleImport = async () => {
    if (!importText.trim()) return
    const name = importName.trim() || `Deck ${deckList.length + 1}`
    const id = importDeck(name, importText)
    setImportText('')
    setImportName('')
    setError(null)
    // Analyze immediately
    const entries = parseDeckList(importText)
    const weights = getActiveWeights()
    const metaCardnos = getMetaCardnos()
    setLoading(l => ({ ...l, [id]: true }))
    try {
      const result = await analyzeDeck(entries, weights, [...metaCardnos, ...entries.map(e=>e.cardno)])
      setDeckResult(id, result)
      setSelectedId(id)
    } catch(e) {
      setError(e.message)
    } finally {
      setLoading(l => ({ ...l, [id]: false }))
    }
  }

  const handleReimport = async (id) => {
    if (!reimportText.trim()) return
    reimportDeck(id, reimportText)
    setReimportId(null)
    setReimportText('')
    const entries = parseDeckList(reimportText)
    const weights = getActiveWeights()
    const metaCardnos = getMetaCardnos()
    setLoading(l => ({ ...l, [id]: true }))
    try {
      const result = await analyzeDeck(entries, weights, metaCardnos)
      setDeckResult(id, result)
    } catch(e) { setError(e.message) }
    finally { setLoading(l => ({ ...l, [id]: false })) }
  }

  return (
    <div className="animate-slide-up">
      <h1 className="font-display text-3xl tracking-widest text-gundam-text mb-2">DECK ANALYZER</h1>
      <p className="text-xs text-gundam-dim font-mono mb-6">
        Decks stored in browser · scores update automatically when weights change
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

        {/* ── Left: import + deck list ── */}
        <div className="xl:col-span-1 space-y-4">

          {/* Import form */}
          <div className="card-surface p-4 space-y-3">
            <h2 className="font-display tracking-widest text-gundam-dim text-sm">IMPORT DECK</h2>
            <input className="input-base w-full" placeholder="Deck name..."
              value={importName} onChange={e => setImportName(e.target.value)} />
            <textarea
              className="input-base w-full font-mono text-xs resize-none h-40"
              placeholder={PLACEHOLDER}
              value={importText}
              onChange={e => setImportText(e.target.value)}
            />
            <button onClick={handleImport} className="btn-primary w-full">Import & Analyze</button>
            {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
          </div>

          {/* Deck list */}
          {deckList.length > 0 && (
            <div className="card-surface p-4 space-y-2">
              <h2 className="font-display tracking-widest text-gundam-dim text-sm mb-3">SAVED DECKS ({deckList.length})</h2>
              {deckList.map(deck => (
                <div key={deck.id}>
                  {/* Rename inline */}
                  {renamingId === deck.id ? (
                    <div className="flex gap-1">
                      <input className="input-base flex-1 text-xs" value={renameVal}
                        onChange={e => setRenameVal(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { renameDeck(deck.id, renameVal); setRenamingId(null) }
                          if (e.key === 'Escape') setRenamingId(null)
                        }} autoFocus />
                      <button onClick={() => { renameDeck(deck.id, renameVal); setRenamingId(null) }}
                        className="btn-ghost text-xs px-2">✓</button>
                    </div>
                  ) : (
                    <div className={clsx(
                      'flex items-center gap-2 p-2 rounded cursor-pointer transition-colors',
                      selectedId === deck.id ? 'bg-gundam-accent/20 border border-gundam-accent/40' : 'hover:bg-gundam-surface'
                    )} onClick={() => setSelectedId(deck.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{deck.name}</div>
                        <div className="text-xs text-gundam-dim font-mono">
                          {deck.source === 'builder' ? '🔨 ' : '📥 '}
                          {deck.entries.length} unique · {deck.entries.reduce((a,e)=>a+e.count,0)} cards
                          {deck.result && (
                            <span className={clsx('ml-2 font-bold', scoreColor(deck.result.total_score))}>
                              {loading[deck.id] ? '…' : deck.result.total_score.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setRenamingId(deck.id); setRenameVal(deck.name) }}
                          className="text-gundam-dim hover:text-gundam-text text-xs px-1" title="Rename">✎</button>
                        {deck.source !== 'builder' && (
                          <button onClick={() => { setReimportId(deck.id); setReimportText(deck.raw || '') }}
                            className="text-gundam-dim hover:text-blue-400 text-xs px-1" title="Reimport">↺</button>
                        )}
                        <button onClick={() => {
                          const text = exportDeckText(deck)
                          navigator.clipboard?.writeText(text).catch(() => {
                            const a = document.createElement('a')
                            a.href = URL.createObjectURL(new Blob([text], {type:'text/plain'}))
                            a.download = deck.name.replace(/[ ]+/g,'_') + '.txt'
                            a.click()
                          })
                        }} className="text-gundam-dim hover:text-green-400 text-xs px-1" title="Export">↓</button>
                        <button onClick={() => { removeDeck(deck.id); if (selectedId===deck.id) setSelectedId(null) }}
                          className="text-gundam-dim hover:text-red-400 text-xs px-1" title="Remove">✕</button>
                      </div>
                    </div>
                  )}

                  {/* Reimport panel */}
                  {reimportId === deck.id && (
                    <div className="mt-2 p-3 bg-gundam-surface rounded border border-gundam-border space-y-2">
                      <textarea className="input-base w-full font-mono text-xs h-32 resize-none"
                        value={reimportText} onChange={e => setReimportText(e.target.value)} />
                      <div className="flex gap-2">
                        <button onClick={() => handleReimport(deck.id)} className="btn-primary text-xs">Reimport</button>
                        <button onClick={() => setReimportId(null)} className="btn-ghost text-xs">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: deck result ── */}
        <div className="xl:col-span-3">
          {!selectedDeck && (
            <div className="flex items-center justify-center h-64 text-gundam-dim font-mono text-sm">
              Import a deck or select one from the list
            </div>
          )}

          {selectedDeck && (
            <div className="space-y-4 animate-slide-up">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-2xl tracking-widest">{selectedDeck.name}</h2>
                {loading[selectedDeck.id] && (
                  <span className="text-xs text-gundam-dim font-mono animate-pulse">Analyzing…</span>
                )}
              </div>

              {selectedDeck.result && !loading[selectedDeck.id] && (
                <DeckResult result={selectedDeck.result} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DeckResult({ result }) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Total Score',  val:result.total_score.toFixed(1), color:'text-green-400' },
          { label:'Total Cards',  val:result.total_cards,            color:'text-gundam-text' },
          { label:'Avg / Card',   val:result.avg_score.toFixed(2),   color:'text-yellow-400' },
        ].map(({ label, val, color }) => (
          <div key={label} className="card-surface p-4 text-center">
            <div className={clsx('font-display text-3xl', color)}>{val}</div>
            <div className="text-xs text-gundam-dim font-mono mt-1">{label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="card-surface p-4">
        <h3 className="font-display tracking-widest text-gundam-dim text-sm mb-3">CONTRIBUTION BY CARD</h3>
        <ResponsiveContainer width="100%" height={Math.max(120, result.cards.length * 26)}>
          <BarChart data={result.cards} layout="vertical" margin={{ left: 0, right: 8 }}>
            <XAxis type="number" tick={{ fill:'#4a4a6a', fontSize:10 }} />
            <YAxis type="category" dataKey="name" width={150}
              tick={{ fill:'#7070a0', fontSize:10 }}
              tickFormatter={v => v.length > 20 ? v.slice(0,18)+'…' : v} />
            <Tooltip
              contentStyle={{ background:'#16161f', border:'1px solid #2a2a3a', borderRadius:6 }}
              labelStyle={{ color:'#e2e2f0', fontSize:11 }}
              formatter={(v, name, props) => {
                const card = result.cards.find(c => c.name === props.payload.name)
                const active = (card?.breakdown || []).filter(b => b.contribution !== 0)
                const lines = active.map(b =>
                  `${b.label}: ${b.contribution > 0 ? '+' : ''}${b.contribution.toFixed(1)}`
                ).join('  |  ')
                return [v.toFixed(2), lines || 'Contribution']
              }}
            />
            <Bar dataKey="contribution" radius={[0,4,4,0]}>
              {result.cards.map((c,i) => (
                <Cell key={i} fill={c.contribution>=15?'#22c55e':c.contribution>=8?'#f5a623':'#3b82f6'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Card table */}
      <div className="card-surface" style={{overflow:"visible", position:"relative"}}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gundam-border bg-gundam-surface">
              {['#','Card','Color','×','Lvl','Cost','AP','HP','Score','Total ⓘ'].map(h => (
                <th key={h} className="text-left px-3 py-2 font-mono text-xs text-gundam-dim"
                  title={h.includes('ⓘ') ? 'Hover total score to see breakdown' : undefined}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.cards.map((c, i) => {
              const cs = getColorStyle(c.color)
              return (
                <tr key={c.cardno} className="border-b border-gundam-border/50 hover:bg-gundam-surface/60" style={{overflow:"visible"}}>
                  <td className="px-3 py-2 font-mono text-xs text-gundam-dim">{i+1}</td>
                  <td style={{padding:'6px 12px', overflow:'visible', position:'relative'}}>
                    <div style={{fontWeight:500}}>
                      <CardImageTooltip cardno={c.cardno} name={c.name} />
                    </div>
                    <div style={{fontSize:11,color:'#6060a0',fontFamily:'monospace'}}>{c.cardno}</div>
                  </td>
                  <td className="px-3 py-2">
                    {c.color && <span className={clsx('tag border text-xs', cs.bg, cs.text, cs.border)}>{c.color}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gundam-dim">×{c.count}</td>
                  <td className="px-3 py-2 font-mono text-xs text-center">{c.level ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-center">{c.cost ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-center text-red-400 font-medium">{c.ap ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-center text-green-400 font-medium">{c.hp ?? '—'}</td>
                  <td className="px-3 py-2 font-mono"><span className={scoreColor(c.score)}>{c.score.toFixed(2)}</span></td>
                  <ContribCell card={c} />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {result.missing.length > 0 && (
        <div className="card-surface p-3 border-yellow-900">
          <span className="text-xs font-mono text-yellow-400">NOT FOUND: </span>
          <span className="text-xs font-mono text-gundam-dim">{result.missing.join(', ')}</span>
        </div>
      )}
    </div>
  )
}
