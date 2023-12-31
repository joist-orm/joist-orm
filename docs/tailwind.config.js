/** @type {import('tailwindcss').Config} */
module.exports = {
  // disable Tailwind's reset
  corePlugins: { preflight: false },
  // my markdown stuff is in ../docs, not /src
  content: ["./src/**/*.{js,jsx,ts,tsx}", "../docs/**/*.mdx"],
  // hooks into docusaurus' dark mode settings
  darkMode: ["class", '[data-theme="dark"]'],
  theme: { extend: {} },
  plugins: [],
};
