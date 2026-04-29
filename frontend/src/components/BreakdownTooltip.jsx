import { useState } from 'react'

export function BreakdownTooltip({ breakdown, contribution, count }) {
  const active = (breakdown || []).filter(b => b.contribution !== 0)
  if (!active.length) return null

  const maxAbs = Math.max(...active.map(b => Math.abs(b.contribution)), 1)

  return (
    <div style={{
      position:        'absolute',
      bottom:          'calc(100% + 8px)',
      right:           0,
      zIndex:          9999,
      width:           280,
      background:      '#12121c',
      border:          '1px solid #3a3a5a',
      borderRadius:    8,
      padding:         '10px 12px',
      pointerEvents:   'none',
      boxShadow:       '0 8px 32px rgba(0,0,0,0.8)',
      fontFamily:      'monospace',
    }}>
      {/* Header */}
      <div style={{
        fontSize:     11,
        color:        '#a0a0c0',
        marginBottom: 8,
        paddingBottom: 6,
        borderBottom: '1px solid #2a2a4a',
        letterSpacing: '0.08em',
      }}>
        SCORE BREAKDOWN
        {count > 1 && (
          <span style={{ color: '#6060a0', marginLeft: 6 }}>
            ×{count} = {contribution.toFixed(2)}
          </span>
        )}
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {active.map(b => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: '#9090b8', width: 110, flexShrink: 0 }}>
              {b.label}
            </span>
            <div style={{
              flex:           1,
              height:         5,
              background:     '#252535',
              borderRadius:   3,
              overflow:       'hidden',
            }}>
              <div style={{
                height:       '100%',
                borderRadius: 3,
                background:   b.contribution >= 0 ? '#4ade80' : '#f87171',
                width:        `${Math.min(100, (Math.abs(b.contribution) / maxAbs) * 100)}%`,
              }} />
            </div>
            <span style={{
              fontSize:   10,
              fontWeight: 600,
              width:      40,
              textAlign:  'right',
              color:      b.contribution >= 0 ? '#4ade80' : '#f87171',
              flexShrink: 0,
            }}>
              {b.contribution > 0 ? '+' : ''}{b.contribution.toFixed(1)}
            </span>
          </div>
        ))}
      </div>

      {/* Note */}
      {active.find(b => b.note) && (
        <div style={{
          marginTop:   8,
          paddingTop:  6,
          borderTop:   '1px solid #2a2a4a',
          fontSize:    10,
          color:       '#6060a0',
          lineHeight:  1.4,
        }}>
          {active.find(b => b.note)?.note}
        </div>
      )}

      {/* Arrow */}
      <div style={{
        position:    'absolute',
        top:         '100%',
        right:       12,
        width:       0,
        height:      0,
        borderLeft:  '6px solid transparent',
        borderRight: '6px solid transparent',
        borderTop:   '6px solid #3a3a5a',
      }} />
    </div>
  )
}

export function ContribCell({ card }) {
  const [show, setShow] = useState(false)
  return (
    <td
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: 'relative', padding: '6px 12px', fontFamily: 'monospace', fontWeight: 600 }}
    >
      <span style={{
        cursor:         'help',
        textDecoration: 'underline dotted rgba(120,120,180,0.4)',
        color: card.contribution >= 15 ? '#4ade80'
             : card.contribution >= 8  ? '#facc15'
             : card.contribution > 0   ? '#e2e2f0'
             : '#7070a0',
      }}>
        {card.contribution.toFixed(2)}
      </span>
      {show && (
        <BreakdownTooltip
          breakdown={card.breakdown}
          contribution={card.contribution}
          count={card.count}
        />
      )}
    </td>
  )
}
