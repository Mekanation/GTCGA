import { Outlet, NavLink } from 'react-router-dom'
import { useProfileStore } from '../store'

export default function Layout() {
  const { activeProfile, profileNames, setActiveProfile } = useProfileStore()

  const navCls = ({ isActive }) =>
    `font-display text-lg tracking-widest transition-colors px-1 pb-1 border-b-2 ${
      isActive ? 'text-gundam-accent border-gundam-accent'
               : 'text-gundam-dim border-transparent hover:text-gundam-text'}`

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gundam-surface border-b border-gundam-border sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center gap-8">
          <span className="font-display text-2xl tracking-widest text-gundam-accent">GUNDAM TCG</span>
          <span className="font-display text-lg tracking-widest text-gundam-dim">ANALYZER</span>
          <nav className="flex items-center gap-6 ml-4">
            <NavLink to="/"        className={navCls} end>CARDS</NavLink>
            <NavLink to="/deck"    className={navCls}>DECK</NavLink>
            <NavLink to="/weights" className={navCls}>WEIGHTS</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gundam-dim font-mono">PROFILE</span>
            <select
              value={activeProfile}
              onChange={e => setActiveProfile(e.target.value)}
              className="input-base text-xs py-1 min-w-[120px]"
            >
              {profileNames().map(p => <option key={p}>{p}</option>)}
            </select>
            <span className="text-xs text-gundam-muted font-mono" title="Profiles are stored in your browser">⚙ local</span>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-gundam-border mt-4 py-3 px-4">
        <p className="text-center text-gundam-muted font-mono" style={{ fontSize: 10 }}>
          All images belong to ©BANDAI and their affiliated parties. Support the official source!&nbsp;
          <a href="https://www.gundam-gcg.com/" target="_blank" rel="noopener noreferrer"
            style={{ color: '#7070a0', textDecoration: 'underline' }}
            onMouseOver={e => e.currentTarget.style.color = '#e8312a'}
            onMouseOut={e => e.currentTarget.style.color = '#7070a0'}>
            Gundam Card Game Official
          </a>
        </p>
      </footer>
    </div>
  )
}
