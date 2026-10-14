# Self-hosted web fonts

The app shell no longer loads its typefaces from Google Fonts. It serves two
variable families from the same origin:

- **Plus Jakarta Sans** — Latin and Latin-ext, upright and italic, weight range
  200–800 (the global body face).
- **Playfair Display** — Latin and Latin-ext, upright and italic, weight range
  400–900 (display headings).

The eight WOFF2 files in `public/` are the Latin/Latin-ext subsets from
Fontsource 5.3.0 (`@fontsource-variable/plus-jakarta-sans` and
`@fontsource-variable/playfair-display`). Their filenames include the first
eight characters of the SHA-256 digest so the one-year static cache in
`public/.htaccess` cannot retain stale font bytes. The matching SIL Open Font
License notices are also shipped in `public/`.

`index.html` preloads only the regular Plus Jakarta Sans face and the two
Playfair Display faces used by the home-page hero. Every face uses
`font-display: swap`; Latin-ext files are only requested when page content
actually includes characters in those ranges. The unused Cinzel face was
removed from the app-shell request. The service-report HTML/PDF templates have
a separate, lazy report-font pipeline and are not changed by this app-shell
optimization.

When updating a font, use the matching Fontsource package, copy only the Latin
and Latin-ext WOFF2 files needed above, recompute the filename digest, update
`@font-face` URLs and preload URLs together, and preserve the package's license
notice. Keep these static files at `public/` root: the deployment contract
intentionally limits `dist/` to its existing top-level directories.
