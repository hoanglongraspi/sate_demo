/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.ejs",
    "./public/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3a86ff',
        'primary-dark': '#2d6cff',
        neutral: {
          lightest: '#f8f9fa',
          lighter: '#f1f3f5',
          light: '#e9ecef',
          DEFAULT: '#ced4da',
          dark: '#6c757d',
          darker: '#495057',
          darkest: '#212529',
        },
        issue: {
          mispronunciation: '#e9d5ff',
          grammar: '#bbf7d0',
          repetition: '#fef08a',
          pause: '#bfdbfe',
          filler: '#fed7aa',
          stuttering: '#93c5fd',
        }
      },
      fontFamily: {
        sans: ['Segoe UI', 'Tahoma', 'Geneva', 'Verdana', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 4px rgba(0, 0, 0, 0.05)',
        modal: '0 4px 20px rgba(0, 0, 0, 0.15)',
      },
      flex: {
        '2': '2 1 0%',
      },
    },
  },
  plugins: [],
}

