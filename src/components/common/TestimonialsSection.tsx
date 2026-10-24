import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Star, ChevronLeft, ChevronRight, Quote, MapPin, ShieldCheck, Sparkles, ArrowRight, PenLine } from 'lucide-react';
import type { DisplayReview, ReviewAggregate } from '../../types';
import { CURATED_TESTIMONIALS } from '../../data/testimonials';
import { api } from '../../services/api';
import {
  REVIEW_SERVICES,
  formatReviewDate,
  mergeReviews,
  publishedToDisplay,
  shownReviewDate,
  summarizeRatings
} from '../../services/reviews';
import { buildReviewsJsonLd } from '../../services/structuredData';
import { JsonLd } from './JsonLd';
import { RouteLink } from './RouteLink';

interface TestimonialsSectionProps {
  onNavigate: (route: string) => void;
}

/** How many published customer reviews the homepage lists (the aggregate counts all of them). */
const HOMEPAGE_REVIEW_LIMIT = 12;
/** Above this many slides the dot strip becomes a "3 / 18" counter. */
const MAX_DOTS = 10;

const testimonialThemes = [
  {
    cardClass: 'testimonial-card testimonial-card-gold',
    tagClass: 'text-amber-300 bg-amber-500/15 border-amber-500/30 hover:bg-amber-500/25',
    pinColor: 'text-amber-400',
    quoteColor: 'text-amber-400/35',
    avatarBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  {
    cardClass: 'testimonial-card testimonial-card-purple',
    tagClass: 'text-purple-300 bg-purple-500/15 border-purple-500/30 hover:bg-purple-500/25',
    pinColor: 'text-purple-400',
    quoteColor: 'text-purple-400/35',
    avatarBg: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  },
  {
    cardClass: 'testimonial-card testimonial-card-rose',
    tagClass: 'text-rose-300 bg-rose-500/15 border-rose-500/30 hover:bg-rose-500/25',
    pinColor: 'text-rose-400',
    quoteColor: 'text-rose-400/35',
    avatarBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
  {
    cardClass: 'testimonial-card testimonial-card-emerald',
    tagClass: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25',
    pinColor: 'text-emerald-400',
    quoteColor: 'text-emerald-400/35',
    avatarBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
  {
    cardClass: 'testimonial-card testimonial-card-sapphire',
    tagClass: 'text-sky-300 bg-sky-500/15 border-sky-500/30 hover:bg-sky-500/25',
    pinColor: 'text-sky-400',
    quoteColor: 'text-sky-400/35',
    avatarBg: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((part) => /[\p{L}\p{N}]/u.test(part))
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/**
 * Homepage reviews (SEO audit 2026-10-15, finding 3).
 *
 * - Verified customer reviews (written from the customer dashboard for a paid,
 *   delivered order and published by an administrator) are fetched when the
 *   section approaches the viewport and listed first, newest first. The
 *   curated testimonials follow, unchanged. Until the fetch resolves — and in
 *   the prerendered HTML — the curated testimonials are what is shown.
 * - Every review links to the page of the service it is about.
 * - The rating summary is visible on every screen size. A publication date is
 *   shown only on a Verified purchase review (shownReviewDate) — the curated
 *   testimonials carry no date, so the six owner-entered reviews no longer
 *   show a clustered Dec 2025–Feb 2026 set that reads as seeded — and the
 *   Review/AggregateRating JSON-LD is built from exactly the reviews displayed.
 */
export const TestimonialsSection: React.FC<TestimonialsSectionProps> = ({ onNavigate }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [verifiedReviews, setVerifiedReviews] = useState<DisplayReview[]>([]);
  const [verifiedTotals, setVerifiedTotals] = useState<ReviewAggregate | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  /** Set once the visitor moves the carousel themselves (arrows, dots, swipe, wheel, keys). */
  const visitorMovedCarousel = useRef(false);
  const markVisitorMove = useCallback(() => {
    visitorMovedCarousel.current = true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .getPublishedReviews(HOMEPAGE_REVIEW_LIMIT)
        .then((res) => {
          if (cancelled || !res.success) return;
          setVerifiedReviews(
            res.reviews.map(publishedToDisplay).filter((review): review is DisplayReview => review !== null)
          );
          setVerifiedTotals(res.aggregate ?? null);
        })
        .catch(() => {
          // Network failure: the curated testimonials stay on screen.
        });
    };
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === 'undefined') {
      load();
      return () => {
        cancelled = true;
      };
    }
    // One request, and only for visitors who scroll towards the reviews.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(section);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  const reviews = useMemo(() => mergeReviews(verifiedReviews, CURATED_TESTIMONIALS), [verifiedReviews]);
  const summary = useMemo(() => {
    // The API totals cover every published review; fall back to the ones on
    // screen if an older API answered without them.
    const totals = verifiedTotals ?? (verifiedReviews.length
      ? { reviewCount: verifiedReviews.length, ratingTotal: verifiedReviews.reduce((sum, r) => sum + r.rating, 0) }
      : null);
    return summarizeRatings(CURATED_TESTIMONIALS, totals);
  }, [verifiedReviews, verifiedTotals]);
  const structuredData = useMemo(() => buildReviewsJsonLd(reviews, summary), [reviews, summary]);

  const activeIndex = Math.min(currentIndex, Math.max(0, reviews.length - 1));

  // Inserting the verified reviews in front of the curated ones makes CSS
  // scroll-snap re-snap to the card that was showing — which now sits further
  // right — so the fresh reviews would load hidden off-screen to the left.
  // Unless the visitor already moved the carousel, start it at the newest one.
  useEffect(() => {
    if (verifiedReviews.length === 0 || visitorMovedCarousel.current) return;
    scrollRef.current?.scrollTo({ left: 0, behavior: 'instant' });
    setCurrentIndex(0);
  }, [verifiedReviews]);

  const scrollToIndex = useCallback((index: number) => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const cards = container.querySelectorAll<HTMLElement>('.testimonial-slider-item');
    if (!cards || cards.length === 0) return;

    const targetCard = cards[index];
    if (targetCard) {
      const scrollPosition = targetCard.offsetLeft - container.offsetLeft;
      container.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
      });
      setCurrentIndex(index);
    }
  }, []);

  const handleNext = useCallback(() => {
    markVisitorMove();
    scrollToIndex((activeIndex + 1) % reviews.length);
  }, [activeIndex, reviews.length, scrollToIndex, markVisitorMove]);

  const handlePrev = useCallback(() => {
    markVisitorMove();
    scrollToIndex((activeIndex - 1 + reviews.length) % reviews.length);
  }, [activeIndex, reviews.length, scrollToIndex, markVisitorMove]);

  // Track active slide on manual touch/scroll
  const handleScrollEvent = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const cards = container.querySelectorAll<HTMLElement>('.testimonial-slider-item');
    if (!cards || cards.length === 0) return;

    const scrollLeft = container.scrollLeft;
    let closestIndex = 0;
    let minDistance = Infinity;

    cards.forEach((card, idx) => {
      const distance = Math.abs(card.offsetLeft - container.offsetLeft - scrollLeft);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = idx;
      }
    });

    setCurrentIndex(closestIndex);
  };

  return (
    <section ref={sectionRef} className="space-y-6 select-none">
      <JsonLd data={structuredData} id="reviews" />

      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="eyebrow">
            <Sparkles className="h-4 w-4" />
            <span>Reviews</span>
          </div>
          <h2 className="display-serif mt-3 text-3xl font-bold text-[#fffdfa] sm:text-4xl">
            What readers say
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-slate-300 sm:text-base">
            Experiences shared by customers who ordered ASTRO SIVAM reports. Reviews marked
            {' '}<span className="font-semibold text-emerald-300">Verified purchase</span> were written by customers
            from their own paid, delivered order.
          </p>
          {summary && (
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-200">
              <span className="flex items-center gap-0.5" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${i <= Math.round(summary.ratingValue) ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`}
                  />
                ))}
              </span>
              <span>
                <strong className="text-[#fffdfa]">{summary.ratingValue.toFixed(1)}</strong> out of 5
                {' · '}
                {summary.reviewCount} {summary.reviewCount === 1 ? 'review' : 'reviews'}
              </span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={handlePrev}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-amber-500/30 bg-[#16122d] text-amber-300 shadow-sm transition-colors hover:border-amber-400 hover:text-amber-200"
            aria-label="Previous review"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-amber-500/30 bg-[#16122d] text-amber-300 shadow-sm transition-colors hover:border-amber-400 hover:text-amber-200"
            aria-label="Next review"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Horizontal Slider Track */}
      <div
        ref={scrollRef}
        onScroll={handleScrollEvent}
        onPointerDown={markVisitorMove}
        onWheel={markVisitorMove}
        onKeyDown={markVisitorMove}
        className="testimonial-scroll flex gap-4 sm:gap-6 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory scroll-smooth no-scrollbar focus:outline-none w-full max-w-full"
        tabIndex={0}
      >
        {reviews.map((review, idx) => {
          const theme = testimonialThemes[idx % testimonialThemes.length];
          const service = REVIEW_SERVICES[review.serviceCode];
          // A date is shown only for a genuine Verified purchase review.
          const shownDate = shownReviewDate(review);

          return (
            <article
              key={review.id}
              aria-label={`Review by ${review.authorName}`}
              className={`testimonial-slider-item ${theme.cardClass} w-[88vw] max-w-[380px] sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] sm:min-w-[340px] shrink-0 snap-start flex flex-col justify-between space-y-4`}
            >
              <div className="space-y-3.5 relative z-10">
                {/* Star Rating & Quote Icon */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1" role="img" aria-label={`Rated ${review.rating} out of 5`}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        aria-hidden="true"
                        className={`w-4 h-4 ${i <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`}
                      />
                    ))}
                  </div>
                  <Quote className={`w-7 h-7 ${theme.quoteColor}`} aria-hidden="true" />
                </div>

                {/* The service this review is about — links to its page. */}
                <RouteLink
                  route={service.route}
                  onNavigate={onNavigate}
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-left text-xs font-bold uppercase leading-snug tracking-wider transition-colors ${theme.tagClass}`}
                  title={`About the ${service.name} report`}
                >
                  <span className="min-w-0">{review.serviceLabel || service.name}</span>
                  <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                </RouteLink>

                {review.title && (
                  <h3 className="text-[15px] font-bold leading-6 text-[#fffdfa]">{review.title}</h3>
                )}

                {/* Feedback text */}
                <p className="text-[15px] font-normal italic leading-7 text-slate-200 whitespace-pre-line">
                  &ldquo;{review.body}&rdquo;
                </p>
              </div>

              {/* Author info */}
              <div className="pt-3.5 border-t border-white/10 flex items-center justify-between gap-3 relative z-10">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold shadow-sm ${theme.avatarBg}`} aria-hidden="true">
                    {initials(review.authorName)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="flex items-center gap-1.5 text-sm font-bold text-[#fffdfa]">
                      <span className="break-words">{review.authorName}</span>
                    </h4>
                    {review.verifiedPurchase && (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>Verified purchase</span>
                      </div>
                    )}
                    {review.location && (
                      <div className="mt-1 flex items-start gap-1 text-[13px] leading-5 text-slate-300">
                        <MapPin className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${theme.pinColor}`} aria-hidden="true" />
                        <span>{review.location}</span>
                      </div>
                    )}
                  </div>
                </div>
                {shownDate && (
                  <time dateTime={shownDate} className="shrink-0 text-right text-xs font-medium text-slate-400">
                    {formatReviewDate(shownDate)}
                  </time>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Slider position */}
      {reviews.length <= MAX_DOTS ? (
        <div className="flex items-center justify-center gap-2 pt-2">
          {reviews.map((review, dotIdx) => (
            <button
              type="button"
              key={review.id}
              onClick={() => {
                markVisitorMove();
                scrollToIndex(dotIdx);
              }}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                activeIndex === dotIdx
                  ? 'w-7 bg-amber-400 shadow-[0_0_8px_rgba(245,180,80,0.5)]'
                  : 'w-2 bg-slate-600/50 hover:bg-slate-500'
              }`}
              aria-label={`Jump to review ${dotIdx + 1}`}
            />
          ))}
        </div>
      ) : (
        <p className="pt-2 text-center text-xs font-semibold text-slate-400" aria-live="polite">
          {activeIndex + 1} / {reviews.length}
        </p>
      )}

      {/* Invite customers to add theirs (reviews are written from the dashboard). */}
      <div className="flex justify-center">
        <RouteLink
          route="dashboard"
          onNavigate={onNavigate}
          className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-500/20"
        >
          <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Ordered a report? Share your feedback</span>
        </RouteLink>
      </div>
    </section>
  );
};
