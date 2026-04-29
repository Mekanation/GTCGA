import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const DEFAULT_WEIGHTS = {
  w_level: 0, w_cost: 0, w_ap: 1, w_hp: 1,
  w_repair: 1, w_breach: 1, w_support: 1,
  w_blocker: 2, w_first_strike: 2, w_high_maneuver: 2, w_suppression: 2,
  w_draw: 1, w_discard: -1,
  w_rth_count: 1, w_rth_level: 1, w_rth_hp: 1,
  w_direct_damage: 1, w_cant_attack_player: 0,
  w_ramp: 0, w_linkable: 0, w_burstable: 0,
  w_dependency_penalty: 0,
}

export const WEIGHT_FIELDS = [
  { key: 'w_level',             label: 'Level (inverted)',    group: 'Stats',          note: 'Higher = prefer lower level cards' },
  { key: 'w_cost',              label: 'Cost (inverted)',     group: 'Stats',          note: 'Higher = prefer lower cost cards' },
  { key: 'w_ap',                label: 'AP',                  group: 'Stats' },
  { key: 'w_hp',                label: 'HP',                  group: 'Stats' },
  { key: 'w_repair',            label: 'Repair',              group: 'Keywords',       note: 'Scaled by HP — low HP reduces repair value' },
  { key: 'w_breach',            label: 'Breach',              group: 'Keywords' },
  { key: 'w_support',           label: 'Support',             group: 'Keywords' },
  { key: 'w_blocker',           label: 'Blocker',             group: 'Keywords' },
  { key: 'w_first_strike',      label: 'First Strike',        group: 'Keywords' },
  { key: 'w_high_maneuver',     label: 'High-Maneuver',       group: 'Keywords' },
  { key: 'w_suppression',       label: 'Suppression',         group: 'Keywords' },
  { key: 'w_draw',              label: 'Draw',                group: 'Keywords',       note: 'Conditional draw (If…) gets 0.5× weight' },
  { key: 'w_discard',           label: 'Discard',             group: 'Keywords' },
  { key: 'w_direct_damage',     label: 'Direct Damage',       group: 'Keywords',       note: 'Value = avg score of cards with HP ≤ X. Units get 2×' },
  { key: 'w_cant_attack_player',label: "Can't Attack Player", group: 'Keywords' },
  { key: 'w_ramp',              label: 'Ramp',                group: 'Keywords' },
  { key: 'w_linkable',          label: 'Linkable',            group: 'Keywords' },
  { key: 'w_burstable',         label: 'Burstable',           group: 'Keywords' },
  { key: 'w_dependency_penalty',label: 'Dependency Penalty',  group: 'Keywords',       note: 'Additive penalty for cards whose effects depend on board/trash/hand state' },
  { key: 'w_rth_count',         label: 'Return(Total Units)', group: 'Return to Hand' },
  { key: 'w_rth_level',         label: 'Return(LVL)',         group: 'Return to Hand', note: 'Avg level of matching meta cards' },
  { key: 'w_rth_hp',            label: 'Return(HP)',          group: 'Return to Hand', note: 'Avg HP of matching meta cards' },
]

// ── Profiles ───────────────────────────────────────────────────────────────────
export const useProfileStore = create(
  persist(
    (set, get) => ({
      profiles: { Default: { ...DEFAULT_WEIGHTS } },
      activeProfile: 'Default',
      setActiveProfile: (name) => set({ activeProfile: name }),
      saveProfile: (name, weights) => set(s => ({
        profiles: { ...s.profiles, [name]: { ...weights } },
        activeProfile: name,
      })),
      deleteProfile: (name) => set(s => {
        const profiles = { ...s.profiles }
        delete profiles[name]
        return { profiles, activeProfile: s.activeProfile === name ? 'Default' : s.activeProfile }
      }),
      getActiveWeights: () => {
        const s = get()
        return s.profiles[s.activeProfile] || DEFAULT_WEIGHTS
      },
      profileNames: () => Object.keys(get().profiles),
    }),
    { name: 'gundam-profiles' }
  )
)

// ── Constants ──────────────────────────────────────────────────────────────────
export const MAX_DECK_SIZE = 50
export const MAX_COPIES    = 4
export const MAX_COLORS    = 2

// ── Deck helpers ───────────────────────────────────────────────────────────────
export function getDeckColors(entries) {
  const colors = new Set()
  entries.forEach(e => {
    const color = e.card?.color || e.color
    if (color && color !== '-') colors.add(color)
  })
  return [...colors]
}

export function getDeckCardCount(entries) {
  return entries.reduce((s, e) => s + e.count, 0)
}

export function canAddCard(entries, card) {
  const total = getDeckCardCount(entries)
  if (total >= MAX_DECK_SIZE) return { ok: false, reason: `Deck is full (${MAX_DECK_SIZE} max)` }

  const existing = entries.find(e => e.cardno === card.cardno)
  if (existing && existing.count >= MAX_COPIES) return { ok: false, reason: `Max ${MAX_COPIES} copies per card` }

  if (card.color && card.color !== '-') {
    const currentColors = getDeckColors(entries)
    if (!currentColors.includes(card.color) && currentColors.length >= MAX_COLORS) {
      return { ok: false, reason: `Deck already has ${MAX_COLORS} colors: ${currentColors.join(', ')}` }
    }
  }
  return { ok: true, reason: null }
}

export function exportDeckText(deck) {
  const lines = [`// ${deck.name}`]
  const sorted = [...(deck.entries || [])].sort((a, b) => a.cardno.localeCompare(b.cardno))
  sorted.forEach(e => lines.push(`${e.count}x ${e.cardno}`))
  return lines.join('\n')
}

// ── Deck store ─────────────────────────────────────────────────────────────────
// deck shape: { id, name, source, entries:[{cardno,count,card?}], result, createdAt }
// source: 'builder' | 'import'
export const useDeckStore = create(
  persist(
    (set, get) => ({
      decks: {},
      activeDeckId: null,

      setActiveDeck: (id) => set({ activeDeckId: id }),

      // ── Builder operations ──────────────────────────────────────────────────
      createDeck: (name) => {
        const id = `deck_${Date.now()}`
        set(s => ({
          decks: { ...s.decks, [id]: { id, name, source: 'builder', entries: [], result: null, createdAt: Date.now() } },
          activeDeckId: id,
        }))
        return id
      },

      addCard: (id, card) => set(s => {
        const deck = s.decks[id]
        if (!deck) return s
        const check = canAddCard(deck.entries, card)
        if (!check.ok) return { ...s, _lastError: check.reason }
        const existing = deck.entries.find(e => e.cardno === card.cardno)
        const entries = existing
          ? deck.entries.map(e => e.cardno === card.cardno ? { ...e, count: e.count + 1 } : e)
          : [...deck.entries, { cardno: card.cardno, count: 1, card }]
        return { decks: { ...s.decks, [id]: { ...deck, entries, result: null } }, _lastError: null }
      }),

      removeCard: (id, cardno) => set(s => {
        const deck = s.decks[id]
        if (!deck) return s
        const entries = deck.entries
          .map(e => e.cardno === cardno ? { ...e, count: e.count - 1 } : e)
          .filter(e => e.count > 0)
        return { decks: { ...s.decks, [id]: { ...deck, entries, result: null } } }
      }),

      // ── Import operations ───────────────────────────────────────────────────
      importDeck: (name, raw) => {
        const entries = parseDeckList(raw)
        const id = `deck_${Date.now()}`
        set(s => ({
          decks: { ...s.decks, [id]: { id, name, source: 'import', raw, entries, result: null, createdAt: Date.now() } },
        }))
        return id
      },

      reimportDeck: (id, raw) => set(s => ({
        decks: { ...s.decks, [id]: { ...s.decks[id], raw, entries: parseDeckList(raw), result: null } }
      })),

      renameDeck: (id, name) => set(s => ({
        decks: { ...s.decks, [id]: { ...s.decks[id], name } }
      })),

      removeDeck: (id) => set(s => {
        const decks = { ...s.decks }
        delete decks[id]
        const activeDeckId = s.activeDeckId === id ? null : s.activeDeckId
        return { decks, activeDeckId }
      }),

      setDeckResult: (id, result) => set(s => ({
        decks: { ...s.decks, [id]: { ...s.decks[id], result } }
      })),

      getAllDecks: () => Object.values(get().decks).sort((a, b) => b.createdAt - a.createdAt),

      getMetaCardnos: () => {
        const all = new Set()
        Object.values(get().decks).forEach(d =>
          (d.entries || []).forEach(e => all.add(e.cardno))
        )
        return [...all]
      },

      lastError: (s) => s._lastError || null,
    }),
    { name: 'gundam-decks' }
  )
)

// ── Parse "Nx CARDID" format ───────────────────────────────────────────────────
export function parseDeckList(raw) {
  const entries = []
  for (const line of (raw || '').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('//')) continue
    const m = t.match(/^(\d+)[xX]\s*([A-Z0-9]+-\d+)/)
    if (m) entries.push({ cardno: m[2], count: parseInt(m[1]) })
  }
  return entries
}

// ── Filter store — persisted so filters survive weight changes ─────────────────
export const useFilterStore = create(
  persist(
    (set) => ({
      search:  '',
      types:   [],
      colors:  [],
      sets:    [],
      levels:  [],
      costs:   [],
      traits:  [],
      sortKey: 'score',
      sortDir: 'desc',
      setSearch:  (v) => set({ search: v }),
      setTypes:   (v) => set({ types: v }),
      setColors:  (v) => set({ colors: v }),
      setSets:    (v) => set({ sets: v }),
      setLevels:  (v) => set({ levels: v }),
      setCosts:   (v) => set({ costs: v }),
      setTraits:  (v) => set({ traits: v }),
      setSortKey: (v) => set({ sortKey: v }),
      setSortDir: (v) => set({ sortDir: v }),
      clearAll:   ()  => set({ search:'', types:[], colors:[], sets:[], levels:[], costs:[], traits:[] }),
    }),
    { name: 'gundam-filters' }
  )
)
