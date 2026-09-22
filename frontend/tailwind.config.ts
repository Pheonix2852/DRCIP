import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        drcip: {
          primary: '#1e3a5f',
          secondary: '#2d6a4f',
          accent: '#e63946',
          warning: '#f4a261',
          critical: '#e63946',
          high: '#f4a261',
          medium: '#e9c46a',
          low: '#2a9d8f',
          background: '#f8f9fa',
          surface: '#ffffff',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config