/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Warm paper surfaces; dark = warm charcoal (not pitch black).
        surface: {
          DEFAULT: '#faf9f6',
          muted: '#f4f1ec',
          subtle: '#eae6de',
          inset: '#e2ded5',
        },
        ink: {
          DEFAULT: '#1b1814',
          muted: '#5d564d',
          subtle: '#a39a8d',
        },
        // Press red — editorial ink + breaking-news accent. OmniCast keeps
        // its vermilion broadcast palette; OmniNews is the newsroom.
        brand: {
          50: '#fbf3f3',
          100: '#f6e0e1',
          200: '#ecc0c3',
          300: '#dd949a',
          400: '#c9555f',
          500: '#b32734',
          600: '#9c1f2c',
          700: '#7d1924',
          800: '#5f141c',
          900: '#451016',
          950: '#2e0a0e',
        },
        success: { 500: '#15803d', 700: '#14532d' },
        warn: { 500: '#b45309', 700: '#92400e' },
        danger: { 500: '#dc2626', 700: '#991b1b' },
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '5px',
        md: '6px',
        lg: '8px',
        xl: '10px',
      },
      boxShadow: {
        soft: '0 1px 1px rgba(60,45,30,0.04), 0 2px 8px -2px rgba(60,45,30,0.08)',
        lift: '0 1px 1px rgba(60,45,30,0.05), 0 8px 24px -8px rgba(60,45,30,0.14)',
        press: 'inset 0 -2px 0 rgba(0,0,0,0.14), 0 1px 1px rgba(60,45,30,0.08)',
        inlay: 'inset 0 1px 0 rgba(255,255,255,0.7)',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Plex Serif for headlines — the editorial voice that sets OmniNews
        // apart from OmniCast's single-family broadcast console.
        display: ['"IBM Plex Serif"', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        'hero-in': {
          from: { opacity: '0', transform: 'translateY(14px) scale(0.985)', filter: 'blur(3px)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
        },
        // Letterpress settle — the plate comes down, ink bleeds, paper sets.
        'press-in': {
          '0%': { opacity: '0', transform: 'scale(1.07) rotate(0.7deg)', filter: 'blur(4px)' },
          '60%': { opacity: '1', transform: 'scale(0.99) rotate(-0.2deg)', filter: 'blur(0.5px)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(0deg)', filter: 'blur(0)' },
        },
        ring: {
          '0%': { transform: 'scale(0.15)', opacity: '0.55' },
          '100%': { transform: 'scale(1)', opacity: '0' },
        },
        'node-pop': {
          '0%, 82%': { opacity: '0.45', transform: 'scale(0.94)' },
          '92%': { opacity: '1', transform: 'scale(1.1)' },
          '100%': { opacity: '0.45', transform: 'scale(0.94)' },
        },
        blink: {
          '0%, 55%': { opacity: '1' },
          '56%, 100%': { opacity: '0.15' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        // Print-rule draws itself left→right (double rules, masthead lines).
        'rule-draw': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        // Fig.1: a pencil line sketches the wire, then the inked dashed wire
        // replaces it. Sketch uses pathLength=1 + dasharray=1 + offset sweep.
        'wire-sketch': {
          '0%': { strokeDashoffset: '1', opacity: '0.9' },
          '70%': { strokeDashoffset: '0', opacity: '0.9' },
          '100%': { strokeDashoffset: '0', opacity: '0' },
        },
        'wire-ink': {
          '0%, 72%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        // Typewriter — width in steps, caret blinks via .animate-blink.
        type: {
          from: { width: '0' },
          to: { width: '38ch' },
        },
        // Rubber stamp slams onto the classified box.
        'stamp-slam': {
          '0%': { opacity: '0', transform: 'scale(2.3) rotate(-28deg)', filter: 'blur(2px)' },
          '55%': { opacity: '1', transform: 'scale(0.94) rotate(-10deg)', filter: 'blur(0)' },
          '75%': { transform: 'scale(1.05) rotate(-13deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(-12deg)' },
        },
      },
      animation: {
        'hero-in': 'hero-in 0.85s cubic-bezier(0.22, 1, 0.36, 1) both',
        'press-in': 'press-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        ring: 'ring 4.2s ease-out infinite',
        'node-pop': 'node-pop 2.6s linear both infinite',
        blink: 'blink 1.4s steps(1) infinite',
        marquee: 'marquee 36s linear infinite',
        'rule-draw': 'rule-draw 0.9s cubic-bezier(0.22, 1, 0.36, 1) both',
        'wire-sketch': 'wire-sketch 1.5s ease-out both',
        'wire-ink': 'wire-ink 1.5s ease-out both',
        type: 'type 1.5s steps(38) 0.5s both',
        'stamp-slam': 'stamp-slam 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
    },
  },
  plugins: [],
};
