/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bebas Neue"', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
        body:    ['"DM Sans"', 'sans-serif'],
      },
      colors: {
        gundam: {
          bg:      '#0a0a0f',
          surface: '#111118',
          card:    '#16161f',
          border:  '#2a2a3a',
          accent:  '#e8312a',
          gold:    '#f5a623',
          blue:    '#3b82f6',
          green:   '#22c55e',
          muted:   '#4a4a6a',
          text:    '#e2e2f0',
          dim:     '#7070a0',
        }
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease',
        'slide-up':   'slideUp 0.25s ease',
        'pulse-slow': 'pulse 3s infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      }
    }
  },
  plugins: []
}
