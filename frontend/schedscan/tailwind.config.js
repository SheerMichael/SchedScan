/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: 'rgb(255 245 245 / <alpha-value>)',
          100: 'rgb(255 227 227 / <alpha-value>)',
          200: 'rgb(255 189 189 / <alpha-value>)',
          300: 'rgb(255 153 153 / <alpha-value>)',
          400: 'rgb(255 102 102 / <alpha-value>)',
          500: 'rgb(230 0 0 / <alpha-value>)',
          600: 'rgb(204 0 0 / <alpha-value>)',
          700: 'rgb(179 0 0 / <alpha-value>)',
          800: 'rgb(153 0 0 / <alpha-value>)',
          900: 'rgb(153 1 0 / <alpha-value>)',
        },
        accent: {
          yellow: '#FDE047',
          pink: '#FCE7F3',
          gray: {
            light: '#F3F4F6',
            medium: '#9CA3AF',
            dark: '#6B7280',
        }
      }
    },
    borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
      }
    },
  },
  presets: [require("nativewind/preset")],
};
