// Use require() so Node's resolver starts from THIS directory (word-addin),
// finding tailwindcss v3 in the add-in's own node_modules. Without this,
// postcss-loader's own resolver hoists up to the workspace root and pulls
// the frontend's tailwindcss v4 — which uses a different plugin model and
// errors out with "tailwindcss has moved to @tailwindcss/postcss".
const tailwindcss = require("tailwindcss");
const autoprefixer = require("autoprefixer");

module.exports = {
  plugins: [tailwindcss, autoprefixer],
};
