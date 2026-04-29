import { useState } from 'react'
import { useProfileStore, DEFAULT_WEIGHTS, WEIGHT_FIELDS } from '../store'
import clsx from 'clsx'

const groups = [...new Set(WEIGHT_FIELDS.map(f => f.group))]

export default function Weights() {
  const { profiles, activeProfile, setActiveProfile, saveProfile, deleteProfile, getActiveWeights } = useProfileStore()
  const [values, setValues] = useState(() => ({ ...DEFAULT_WEIGHTS, ...getActiveWeights() }))
  const [newName, setNewName] = useState('')
  const [saved, setSaved] = useState(false)

  const profileNames = Object.keys(profiles)

  const handleProfileChange = (name) => {
    setActiveProfile(name)
    setValues({ ...DEFAULT_WEIGHTS, ...(profiles[name] || {}) })
  }

  const set = (key, val) => setValues(v => ({ ...v, [key]: val }))

  const save = (name = activeProfile) => {
    saveProfile(name, values)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const saveNew = () => {
    const n = newName.trim()
    if (!n) return
    saveProfile(n, values)
    setNewName('')
  }

  const del = () => {
    if (activeProfile === 'Default') return
    if (!confirm(`Delete profile "${activeProfile}"?`)) return
    deleteProfile(activeProfile)
    setValues({ ...DEFAULT_WEIGHTS })
  }

  return (
    <div className="animate-slide-up max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl tracking-widest text-gundam-text">WEIGHT PROFILES</h1>
          <p className="text-xs text-gundam-dim font-mono mt-1">
            Stored in your browser · cleared if you clear cookies/cache
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-400 font-mono animate-fade-in">SAVED ✓</span>}
          <button onClick={() => save()} className="btn-primary">Save Profile</button>
        </div>
      </div>

      {/* Profile bar */}
      <div className="card-surface p-4 mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-gundam-dim">ACTIVE PROFILE</label>
          <select className="input-base min-w-[160px]" value={activeProfile} onChange={e => handleProfileChange(e.target.value)}>
            {profileNames.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        {activeProfile !== 'Default' && (
          <button onClick={del} className="btn-ghost text-red-500 border-red-900 hover:border-red-700 self-end">Delete</button>
        )}
        <div className="flex flex-col gap-1 ml-auto">
          <label className="text-xs font-mono text-gundam-dim">SAVE AS NEW</label>
          <div className="flex gap-2">
            <input className="input-base w-44" placeholder="Profile name..." value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveNew()} />
            <button onClick={saveNew} className="btn-ghost">Save New</button>
          </div>
        </div>
      </div>

      {/* Weight fields */}
      <div className="space-y-4">
        {groups.map(group => (
          <div key={group} className="card-surface p-5">
            <h2 className="font-display text-lg tracking-widest text-gundam-dim mb-4">{group.toUpperCase()}</h2>
            <div className="space-y-3">
              {WEIGHT_FIELDS.filter(f => f.group === group).map(f => {
                const val = values[f.key] ?? 0
                return (
                  <div key={f.key} className="flex items-center gap-4">
                    <div className="w-56 shrink-0">
                      <div className="text-sm text-gundam-text">{f.label}</div>
                      {f.note && <div className="text-xs text-gundam-muted mt-0.5">{f.note}</div>}
                    </div>
                    <input type="range" min="-5" max="10" step="0.5" value={val}
                      onChange={e => set(f.key, parseFloat(e.target.value))}
                      className="flex-1 accent-gundam-accent" />
                    <input type="number" min="-5" max="10" step="0.5" value={val}
                      onChange={e => set(f.key, parseFloat(e.target.value) || 0)}
                      className="input-base w-20 text-center font-mono" />
                    <div className="w-20">
                      <div className="h-1.5 bg-gundam-surface rounded-full overflow-hidden">
                        <div className={clsx('h-full rounded-full', val >= 0 ? 'bg-green-500' : 'bg-red-500')}
                          style={{ width: `${Math.min(100, Math.abs(val) * 10)}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
