import React from 'react';
import emblemImg from '@shared/assets/astrosivam_logo.png';
import fullLogoImg from '@shared/assets/astrosivam_full_logo.png';
import { BRAND } from '../../appConfig';

/**
 * The ASTRO SIVAM brand lock-up — the same emblem, the same name, the same
 * slogan the live navbar and footer print (BRAND_NAME / BRAND_SLOGAN are read
 * from the live BrandLockup module so the words can never drift).
 *
 * Only the *surface* changed for the light UI: on paper the wordmark is set in
 * ink and the slogan in gold, instead of the gold-gradient treatment the dark
 * theme uses. The assets are the brand's own files, untouched.
 */
export const BrandWordmark: React.FC<{
  /** '' when the surrounding control already announces the name. */
  emblemAlt?: string;
  className?: string;
  size?: 'sm' | 'lg';
}> = ({ emblemAlt = `${BRAND.name} Emblem`, className = '', size = 'sm' }) => (
  <>
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-full border border-brand/35 bg-white ${
        size === 'lg' ? 'h-14 w-14 sm:h-16 sm:w-16' : 'h-10 w-10 sm:h-11 sm:w-11'
      } ${className}`}
    >
      <img
        src={emblemImg}
        alt={emblemAlt}
        referrerPolicy="no-referrer"
        className="h-full w-full rounded-full object-cover p-[3px]"
      />
    </span>
    <span className="flex min-w-0 flex-col justify-center">
      <span
        className={`c-display block truncate font-black uppercase leading-tight tracking-[0.06em] text-ink ${
          size === 'lg' ? 'text-xl sm:text-2xl' : 'text-[1.02rem] sm:text-[1.15rem]'
        }`}
      >
        {BRAND.name}
      </span>
      <span
        className={`mt-0.5 block truncate font-bold uppercase leading-none text-brand-ink ${
          size === 'lg' ? 'text-[0.64rem] tracking-[0.2em]' : 'text-[0.56rem] tracking-[0.16em]'
        }`}
      >
        {BRAND.slogan}
      </span>
    </span>
  </>
);

/** The full horizontal lock-up, exactly as the live About page displays it. */
export const BrandFullLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <img
    src={fullLogoImg}
    alt={`${BRAND.name} Official Logo`}
    referrerPolicy="no-referrer"
    className={`h-auto w-full max-h-32 object-contain ${className}`}
  />
);
