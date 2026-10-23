/**
 * THE ORDER JOURNEY — one source of truth for what happens to an order.
 *
 * Owner request (2026-10-24): "clearly mention every place the astrology order
 * goes to the priest team in India, they calculate and verify, after admin
 * approval the email goes to the user's email — with the priest data."
 *
 * Before this file the flow was described in eight slightly different ways
 * across the pages and FAQs: some dropped "India", some dropped the priest
 * verification, some said "admin review" without saying what is reviewed, and
 * the tax invoice was sometimes omitted. A customer reading two pages could see
 * two different promises. Every surface now renders the wording below, so the
 * promise cannot drift page by page.
 *
 * The statement is deliberately stated in four steps, in this order:
 *   1. the order reaches our India-based Vedic priest team;
 *   2. the priest team calculates the chart and verifies the report by hand;
 *   3. the administrator approves the finished report;
 *   4. the PDF report + tax invoice are emailed to the customer's registered
 *      address, carrying the verification line that names the priest team.
 *
 * The AI Astrologer answers the same four steps in English, Tamil and Hindi —
 * see api/astrology/ai_astrologer_offline.php (orderBubbles, topic "process"),
 * which keeps its own translated copy because the chat is a PHP runtime.
 */
export interface OrderJourneyStep {
  /** Short title shown in the step strip. */
  title: string;
  /** One line that says exactly what happens in this step. */
  description: string;
}

/** The four steps, in the order the customer experiences them. */
export const ORDER_JOURNEY_STEPS: readonly OrderJourneyStep[] = [
  {
    title: '1. Your order reaches our priest team in India',
    description:
      'The moment your order is placed, it is queued for our India-based Vedic priest team — the same team that prepares every ASTRO SIVAM report.'
  },
  {
    title: '2. The priest team calculates and verifies your chart',
    description:
      'Our priests calculate the horoscope from your birth details with the Chitra Paksha Lahiri ephemeris, then verify the charts, dashas and verdicts by hand before the report is released.'
  },
  {
    title: '3. The administrator approves the finished report',
    description:
      'The completed report goes to the administrator for approval. Nothing is emailed until the priest team’s verification and the administrator’s approval are both complete.'
  },
  {
    title: '4. Your report and tax invoice are emailed to you',
    description:
      'Your official PDF report and tax invoice are emailed to your registered email address, carrying a verification line that confirms the India-based priest team calculated and verified your report.'
  }
] as const;

/** The journey as one sentence — used where a full panel does not fit. */
export const ORDER_JOURNEY_LINE =
  'Every order is calculated and verified by our India-based Vedic priest team, approved by the administrator, and then emailed to your registered address as a PDF report with your tax invoice.';

/** Heading + intro for the panel the pages render. */
export const ORDER_JOURNEY_HEADING = 'What happens after you order';
export const ORDER_JOURNEY_INTRO =
  'Every ASTRO SIVAM order follows the same four steps — from our priest team in India to your inbox.';

/**
 * The answer every delivery FAQ uses. One string, so the homepage FAQ and the
 * service-page FAQs cannot promise different things.
 */
export const ORDER_JOURNEY_FAQ_ANSWER =
  'Your order goes to our India-based Vedic priest team, who calculate the chart and verify the report by hand. Once the priest team’s verification and the administrator’s approval are complete, your official PDF report and Tax Invoice — carrying a verification line naming the priest team that calculated and verified it — are emailed to your registered email address. Please check your Spam / Junk folder as well.';

/**
 * Every delivery FAQ on the site. The question wording differs per service, but
 * the answer is always ORDER_JOURNEY_FAQ_ANSWER so no page can describe a
 * different delivery promise.
 */
export const ORDER_JOURNEY_FAQ = {
  question: 'What happens to my order after I pay?',
  answer: ORDER_JOURNEY_FAQ_ANSWER
} as const;

/**
 * The same promise for a service whose delivered document is a certificate
 * (Baby Naming) rather than a report. Only the document word changes.
 */
export function orderJourneyFaqAnswer(documentLabel: 'report' | 'certificate' = 'report'): string {
  if (documentLabel === 'report') return ORDER_JOURNEY_FAQ_ANSWER;
  return `Your order goes to our India-based Vedic priest team, who calculate the chart and verify the certificate by hand. Once the priest team’s verification and the administrator’s approval are complete, your official PDF certificate and Tax Invoice — carrying a verification line naming the priest team that calculated and verified it — are emailed to your registered email address. Please check your Spam / Junk folder as well.`;
}
