import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { PageKey } from '../../appConfig';

/**
 * The same Home → Services → page trail the live pages publish as breadcrumb
 * structured data (buildBreadcrumbJsonLd), drawn so it is visible too. The
 * labels are the site's own: Home, Services, then the page's own name.
 */
export const PageBreadcrumb: React.FC<{
  label: string;
  onNavigate: (key: PageKey) => void;
}> = ({ label, onNavigate }) => (
  <nav aria-label="Breadcrumb" className="c-shell pt-6">
    <ol className="flex flex-wrap items-center gap-1.5 text-[0.75rem] text-muted">
      <li>
        <button type="button" onClick={() => onNavigate('home')} className="transition hover:text-brand-ink">
          Home
        </button>
      </li>
      <li aria-hidden="true">
        <ChevronRight size={12} className="text-faint" />
      </li>
      <li>
        <button
          type="button"
          onClick={() => onNavigate('services')}
          className="transition hover:text-brand-ink"
        >
          Services
        </button>
      </li>
      <li aria-hidden="true">
        <ChevronRight size={12} className="text-faint" />
      </li>
      <li className="font-semibold text-ink-soft">{label}</li>
    </ol>
  </nav>
);
