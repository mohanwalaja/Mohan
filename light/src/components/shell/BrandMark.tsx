import React from 'react';
import emblemImg from '@shared/assets/astrosivam_logo.png';
import fullLogoImg from '@shared/assets/astrosivam_full_logo.png';
import { BRAND } from '../../appConfig';

/**
 * The ASTRO SIVAM lock-up — one line of type, copied from the live component.
 *
 * Structure, type, weights, tracking and sizes are the live BrandWordmark's,
 * class for class: emblem at the left, then the name over the slogan to its
 * right, in the site's own serif (`Playfair Display`, the face `.display-serif`
 * uses), font-black, uppercase, tracking-wider for the name and a small
 * letterspaced 0.2em line for the slogan. The name and slogan strings are read
 * from the live BrandLockup module, so the words can never drift.
 *
 * The only difference is the paint, because the surface is paper instead of
 * near-black: the gold gradient is stepped down to the brand's deeper golds so
 * it stays legible on cream (the live stops, #ffe58f → #f59e0b, are tuned for a
 * dark background), and the logo's drop shadow becomes a soft light lift. The
 * emblem is the brand's own PNG, unframed, exactly as the live navbar shows it.
 */
const EMBLEM_CLASS =
  'h-11 w-11 object-contain transition-transform duration-300 group-hover:scale-105 drop-shadow-[0_2px_8px_rgba(217,154,43,0.35)] sm:h-12 sm:w-12';
const NAME_CLASS =
  'c-display bg-gradient-to-r from-[#c98f1e] via-[#b8801c] to-[#8a5a10] bg-clip-text text-transparent ' +
  'text-xl font-black uppercase leading-tight tracking-wider sm:text-2xl';
const SLOGAN_CLASS =
  'mt-0.5 block text-[9px] font-bold uppercase leading-none tracking-[0.2em] text-brand-ink sm:text-[10px]';

interface BrandWordmarkProps {
  /** Sizing/effects for the emblem image. Defaults to the live navbar/footer size. */
  emblemClassName?: string;
  /** Alt text — pass '' when the surrounding control already announces the name. */
  emblemAlt?: string;
}

export const BrandWordmark: React.FC<BrandWordmarkProps> = ({
  emblemClassName = EMBLEM_CLASS,
  emblemAlt = `${BRAND.name} Emblem`
}) => (
  <>
    <span className="relative flex shrink-0 items-center justify-center">
      <img src={emblemImg} alt={emblemAlt} referrerPolicy="no-referrer" className={emblemClassName} />
    </span>
    <span className="flex flex-col justify-center">
      <span className={NAME_CLASS}>{BRAND.name}</span>
      <span className={SLOGAN_CLASS}>{BRAND.slogan}</span>
    </span>
  </>
);

/** The full horizontal lock-up, exactly as the live About page displays it. */
export const BrandFullLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <img
    src={fullLogoImg}
    alt={`${BRAND.name} Official Logo`}
    referrerPolicy="no-referrer"
    className={`h-auto max-h-32 w-full object-contain ${className}`}
  />
);
