import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getCard } from '../api'
import { useProfileStore, useDeckStore } from '../store'
import { getColorStyle, getKeywords, scoreColor, RARITY_STYLES, TYPE_ICON } from '../utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import clsx from 'clsx'

export default function CardDetail() {
  const { cardno } = useParams()
  const { getActiveWeights } = useProfileStore()
  const { getMetaCardnos } = useDeckStore()
  const [card, setCard]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getCard(decodeURIComponent(cardno), getActiveWeights(), getMetaCardnos())
      .then(setCard).finally(() => setLoading(false))
  }, [cardno, JSON.stringify(getActiveWeights())])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="font-mono text-gundam-dim animate-pulse">Loading...</div>
    </div>
  )
  if (!card) return <div className="text-gundam-dim">Card not found.</div>

  const cs = getColorStyle(card.color)
  const kws = getKeywords(card)
  const breakdown = (card.breakdown || []).filter(b => b.contribution !== 0)

  return (
    <div className="animate-slide-up max-w-4xl">
      <Link to="/" className="text-xs text-gundam-dim hover:text-gundam-text font-mono mb-4 inline-block">← BACK</Link>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div className={clsx('card-surface p-6 border-l-4', cs.border)}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="font-display text-3xl tracking-wider mb-1">{card.name}</h1>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-gundam-dim">{card.cardno}</span>
                  {card.color && <span className={clsx('tag border',cs.bg,cs.text,cs.border)}>{card.color}</span>}
                  <span className={clsx('tag',RARITY_STYLES[card.rarity])}>{card.rarity}</span>
                  <span className="text-xs text-gundam-dim">{TYPE_ICON[card.card_type]} {card.card_type}</span>
                </div>
              </div>
              <div className="text-right">
                <div className={clsx('font-display text-4xl', scoreColor(card.score))}>{card.score?.toFixed(1)}</div>
                <div className="text-xs text-gundam-dim font-mono">SCORE</div>
              </div>
            </div>
            {(card.card_type==='Unit'||card.card_type==='Pilot') && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[{label:'LEVEL',val:card.level,color:'text-gundam-gold'},{label:'COST',val:card.cost,color:'text-gundam-gold'},
                  {label:'AP',val:card.ap,color:'text-red-400'},{label:'HP',val:card.hp,color:'text-green-400'}].map(({label,val,color})=>(
                  <div key={label} className="bg-gundam-surface rounded p-3 text-center">
                    <div className={clsx('font-mono text-2xl font-medium',color)}>{val??'—'}</div>
                    <div className="text-xs text-gundam-dim font-mono mt-1">{label}</div>
                  </div>
                ))}
              </div>
            )}
            {kws.length>0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {kws.map(k=><span key={k.label} className={clsx('tag text-xs px-2 py-1',k.color)}>{k.label}</span>)}
              </div>
            )}
            {card.effect && (
              <div className="bg-gundam-surface/60 rounded p-4 text-sm leading-relaxed border border-gundam-border/50">{card.effect}</div>
            )}
            <div className="mt-4 space-y-1.5 text-xs text-gundam-dim font-mono">
              {card.trait      && <div><span className="text-gundam-muted mr-2">TRAIT</span>{card.trait}</div>}
              {card.link_pilot && <div><span className="text-gundam-muted mr-2">LINK</span>{card.link_pilot}</div>}
              {card.series     && <div><span className="text-gundam-muted mr-2">SERIES</span>{card.series}</div>}
              {card.market_price && <div><span className="text-gundam-muted mr-2">PRICE</span>${parseFloat(card.market_price).toFixed(2)}</div>}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-surface p-4">
            <h2 className="font-display text-lg tracking-wider text-gundam-dim mb-4">SCORE BREAKDOWN</h2>
            {breakdown.length===0
              ? <p className="text-xs text-gundam-dim">No weighted contributions with current settings.</p>
              : (<>
                  <div className="space-y-2 mb-4">
                    {breakdown.map(b=>(
                      <div key={b.label}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gundam-dim font-mono w-28 shrink-0">{b.label}</span>
                          <div className="flex-1 bg-gundam-surface rounded-full h-1.5 overflow-hidden">
                            <div className={clsx('h-full rounded-full',b.contribution>=0?'bg-green-500':'bg-red-500')}
                              style={{width:`${Math.min(100,Math.abs(b.contribution)*4)}%`}}/>
                          </div>
                          <span className={clsx('text-xs font-mono w-14 text-right',b.contribution>=0?'text-green-400':'text-red-400')}>
                            {b.contribution>0?'+':''}{b.contribution.toFixed(1)}
                          </span>
                        </div>
                        {b.note && <div className="text-xs text-gundam-muted ml-28 mt-0.5">{b.note}</div>}
                      </div>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={breakdown} layout="vertical" margin={{left:0,right:8}}>
                      <XAxis type="number" tick={{fill:'#4a4a6a',fontSize:10}}/>
                      <YAxis type="category" dataKey="label" tick={{fill:'#4a4a6a',fontSize:10}} width={80}/>
                      <Tooltip contentStyle={{background:'#16161f',border:'1px solid #2a2a3a',borderRadius:6}}
                        labelStyle={{color:'#e2e2f0',fontSize:11}} itemStyle={{color:'#7070a0',fontSize:11}}/>
                      <Bar dataKey="contribution" radius={[0,4,4,0]}>
                        {breakdown.map((b,i)=><Cell key={i} fill={b.contribution>=0?'#22c55e':'#ef4444'}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </>)}
          </div>
        </div>
      </div>
    </div>
  )
}
