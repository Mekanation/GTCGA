import { useState, useRef, useCallback } from 'react'

const IMAGE_URL = (cardno) => `/api/images/${cardno}`

const IMG_W = 360
const IMG_H = 500
const GAP   = 10

export function CardImageTooltip({ cardno, name, fixedPosition = false }) {
  const [show, setShow] = useState(false)
  const [err, setErr]   = useState(false)
  const [pos, setPos]   = useState({ top: 0, left: 0 })
  const spanRef         = useRef(null)

  const updatePos = useCallback(() => {
    if (!fixedPosition || !spanRef.current) return
    const rect = spanRef.current.getBoundingClientRect()

    // position:fixed coords are viewport-relative — do NOT add scrollY/scrollX
    let top  = rect.top - IMG_H - GAP
    let left = rect.left

    // If off the top, show below
    if (top < 8) top = rect.bottom + GAP

    // If off the right edge, shift left
    if (left + IMG_W > window.innerWidth - 8) left = window.innerWidth - IMG_W - 8

    if (left < 8) left = 8

    setPos({ top, left })
  }, [fixedPosition])

  const handleMouseEnter = useCallback(() => {
    updatePos()
    setShow(true)
  }, [updatePos])

  const imgStyle = {
    width:          IMG_W,
    height:         IMG_H,
    objectFit:      'contain',
    objectPosition: 'center',
    background:     '#0a0a0f',
    borderRadius:   10,
    border:         '1px solid rgba(80,80,120,0.6)',
    display:        'block',
  }

  // Absolute mode (Deck Analyzer) — anchored to parent td, no scroll issues there
  const absoluteContainerStyle = {
    position:      'absolute',
    bottom:        'calc(100% + 8px)',
    left:          0,
    zIndex:        9999,
    width:         IMG_W,
    pointerEvents: 'none',
    filter:        'drop-shadow(0 8px 32px rgba(0,0,0,0.9))',
  }

  // Fixed mode (Card List) — viewport-relative, escapes table overflow clipping
  const fixedContainerStyle = {
    position:      'fixed',
    top:           pos.top,
    left:          pos.left,
    zIndex:        99999,
    width:         IMG_W,
    pointerEvents: 'none',
    filter:        'drop-shadow(0 8px 32px rgba(0,0,0,0.9))',
  }

  return (
    <>
      <span
        ref={spanRef}
        style={{ cursor: 'help', textDecoration: 'underline dotted rgba(120,120,180,0.4)', display: 'inline' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShow(false)}
      >
        {name}
      </span>

      {show && !err && (
        <div style={fixedPosition ? fixedContainerStyle : absoluteContainerStyle}>
          <img
            src={IMAGE_URL(cardno)}
            alt={name}
            onError={() => setErr(true)}
            style={imgStyle}
          />
        </div>
      )}
    </>
  )
}
