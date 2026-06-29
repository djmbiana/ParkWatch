export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand green - matches the favicon (#3da044). Used on the shared/public
        // surfaces (landing, login, register). Staff portals each tint their
        // accent to a different shade of green via the .portal-* classes in
        // index.css, so the roles stay distinguishable but the product reads as
        // one connected green family.
        brand: {
          DEFAULT: '#3DA044',
          dark:    '#2F7D36',
          light:   '#ECF6ED',
        },
      },
    },
  },
  plugins: [],
}
