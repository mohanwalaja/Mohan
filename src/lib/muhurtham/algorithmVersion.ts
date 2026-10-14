/**
 * Version of the Subha Muhurtham scan algorithm.
 *
 * A saved Muhurtham result is only trusted when it carries the current number,
 * so this constant is read by the report layer's staleness checks as well as by
 * the scanner itself. It lives in its own module because `scanner.ts` imports
 * the astronomy engine (~175 KB): a staleness check must not drag an ephemeris
 * into a bundle that only renders a report (audit PERF-1).
 *
 * The value is part of the TypeScript/PHP parity contract — `AstroEngine`
 * carries the same number and the tests compare them. Bump both together, and
 * only for a change that alters which dates a scan returns.
 */
export const MUHURTHAM_ALGORITHM_VERSION = 6;
