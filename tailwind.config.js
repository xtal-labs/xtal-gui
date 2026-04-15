/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="amethyst"]'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['Chakra Petch', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'Geist Mono', 'JetBrains Mono', 'monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        'background-secondary': 'hsl(var(--background-secondary))',
        foreground: 'hsl(var(--foreground))',
        'foreground-secondary': 'hsl(var(--foreground-secondary))',
        'foreground-muted': 'hsl(var(--foreground-muted))',
        heading: 'hsl(var(--heading))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          elevated: 'hsl(var(--card-elevated))',
          foreground: 'hsl(var(--foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          glow: 'hsl(var(--primary-glow))',
          hover: 'hsl(var(--primary-hover))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        border: {
          DEFAULT: 'hsl(var(--border))',
          hover: 'hsl(var(--border-hover))',
        },
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
        crystal: {
          stem: 'hsl(var(--crystal-stem))',
          leaf: 'hsl(var(--crystal-leaf))',
          fruit: 'hsl(var(--crystal-fruit))',
          'facet-light': 'hsl(var(--crystal-facet-light))',
          'facet-dark': 'hsl(var(--crystal-facet-dark))',
          edge: 'hsl(var(--crystal-edge))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        'glow-sm': '0 0 10px hsl(var(--glow-color))',
        glow: '0 0 20px hsl(var(--glow-color)), 0 0 40px hsl(var(--glow-color))',
        'inner-glow':
          'inset 0 1px 0 0 hsl(var(--primary) / 0.1), inset 0 0 20px hsl(var(--primary) / 0.05)',
        crystalline:
          '0 4px 20px -2px hsl(var(--primary) / 0.15), 0 2px 8px -2px hsl(var(--primary) / 0.1)',
        'crystalline-lg':
          '0 8px 30px -4px hsl(var(--primary) / 0.2), 0 4px 12px -4px hsl(var(--primary) / 0.15)',
      },
      animation: {
        'pulse-live': 'pulse-live 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 1.5s infinite',
        'data-flash': 'data-flash 0.5s ease-out',
        'block-enter': 'block-enter var(--block-anim-duration, 400ms) ease-out forwards',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'fade-in-up': 'fade-in-up 0.4s ease-out',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      keyframes: {
        'pulse-live': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'data-flash': {
          '0%': { backgroundColor: 'hsl(var(--primary) / 0.2)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'block-enter': {
          from: { maxHeight: '0', opacity: '0', transform: 'translateY(-8px)' },
          to: { maxHeight: '60px', opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(10px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
      },
      spacing: {
        'sidebar-width': 'var(--sidebar-width)',
        'sidebar-collapsed': 'var(--sidebar-collapsed)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
