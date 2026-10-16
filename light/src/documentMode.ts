/**
 * Which build is this light bundle running in?
 *
 * DOCUMENT mode — a deployed light document (scripts/prerender-light.mjs).
 * Those documents carry `data-prerendered="true"`, exactly like the classic
 * ones, and public/.htaccess serves them at the site's canonical clean URLs
 * while the operator has the light design selected (Admin → Site Design).
 *
 * HASH mode — the standalone preview build (`npm run dev:light` /
 * `npm run preview:light`): a folder of static files with no server rewrites,
 * which is what the live preview in the Arena chat serves.
 *
 * The difference matters wherever a reference cannot be followed from inside
 * the preview but can be from the deployed site — the account links
 * (`/login`, `/register` are classic-design pages on the real host) and the
 * contact form (it posts to the real API on the real host).
 */
export function isDocumentMode(): boolean {
  try {
    return document.documentElement.getAttribute('data-prerendered') === 'true';
  } catch {
    return false;
  }
}
