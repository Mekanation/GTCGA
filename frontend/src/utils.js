export const COLOR_STYLES = {
  Blue:   { bg:'bg-blue-900/40',   text:'text-blue-300',   border:'border-blue-700' },
  Green:  { bg:'bg-green-900/40',  text:'text-green-300',  border:'border-green-700' },
  Red:    { bg:'bg-red-900/40',    text:'text-red-300',    border:'border-red-700' },
  White:  { bg:'bg-slate-700/40',  text:'text-slate-200',  border:'border-slate-500' },
  Purple: { bg:'bg-purple-900/40', text:'text-purple-300', border:'border-purple-700' },
  Yellow: { bg:'bg-yellow-900/40', text:'text-yellow-300', border:'border-yellow-700' },
  Multi:  { bg:'bg-cyan-900/40',   text:'text-cyan-300',   border:'border-cyan-700' },
}
export const RARITY_STYLES = {
  C:'text-gundam-dim bg-gundam-surface', U:'text-blue-400 bg-blue-950',
  R:'text-yellow-400 bg-yellow-950', SR:'text-purple-400 bg-purple-950',
  LR:'text-red-400 bg-red-950 font-bold',
}
export const TYPE_ICON = {
  Unit:'⚡', Pilot:'👤', Command:'📜', Base:'🏛', 'EX Base':'🛡',
  Resource:'⬡', 'EX Resource':'⬡', Token:'◈',
}
export const getColorStyle = (color) =>
  COLOR_STYLES[color] || { bg:'bg-gundam-surface', text:'text-gundam-dim', border:'border-gundam-border' }

export const getKeywords = (card) => {
  const k = []
  if (card.kw_repair)             k.push({ label:`Repair ${card.kw_repair}`,     color:'text-green-400 bg-green-950' })
  if (card.kw_breach)             k.push({ label:`Breach ${card.kw_breach}`,     color:'text-orange-400 bg-orange-950' })
  if (card.kw_support)            k.push({ label:`Support ${card.kw_support}`,   color:'text-blue-400 bg-blue-950' })
  if (card.kw_blocker)            k.push({ label:'Blocker',                       color:'text-yellow-400 bg-yellow-950' })
  if (card.kw_first_strike)       k.push({ label:'First Strike',                  color:'text-red-400 bg-red-950' })
  if (card.kw_high_maneuver)      k.push({ label:'High-Maneuver',                 color:'text-cyan-400 bg-cyan-950' })
  if (card.kw_suppression)        k.push({ label:'Suppression',                   color:'text-purple-400 bg-purple-950' })
  if (card.kw_draw)               k.push({ label:`Draw ${card.kw_draw}`,          color:'text-sky-400 bg-sky-950' })
  if (card.kw_discard)            k.push({ label:`Discard ${card.kw_discard}`,    color:'text-pink-400 bg-pink-950' })
  if (card.kw_direct_damage)      k.push({ label:`Dmg ${card.kw_direct_damage}`,  color:'text-red-300 bg-red-900' })
  if (card.kw_cant_attack_player) k.push({ label:"Can't Atk Player",              color:'text-slate-400 bg-slate-800' })
  if (card.kw_ramp)               k.push({ label:'Ramp',                          color:'text-emerald-400 bg-emerald-950' })
  if (card.kw_linkable)           k.push({ label:'Linkable',                      color:'text-indigo-400 bg-indigo-950' })
  if (card.kw_burstable)          k.push({ label:'Burst',                         color:'text-amber-400 bg-amber-950' })
  if (card.rth_count)             k.push({ label:`RTH ×${card.rth_count}`,        color:'text-violet-400 bg-violet-950' })
  if (card.kw_dependent)          k.push({ label:'Dependent',  color:'text-slate-300 bg-slate-700' })
  return k
}

export const scoreColor = (s) =>
  s >= 15 ? 'text-green-400' : s >= 8 ? 'text-yellow-400' : s > 0 ? 'text-gundam-text' : 'text-gundam-dim'
