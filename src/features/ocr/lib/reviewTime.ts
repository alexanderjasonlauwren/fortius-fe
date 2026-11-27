/**
 * How long a review form was open, sent with the decision for the engine's
 * trainer (partner doc C15, review_seconds). Only the time comes from here:
 * which values were changed, the server works out from the engine's answer.
 */

/** A day: a form left open overnight is not a review time. */
const MAX_REVIEW_SECONDS = 86_400;

/** Whole seconds from openedAt (ms) to now; undefined when unknown. */
export function reviewSeconds(openedAt: number | undefined, now: number): number | undefined {
  if (openedAt === undefined || now < openedAt) return undefined;
  return Math.min(Math.round((now - openedAt) / 1000), MAX_REVIEW_SECONDS);
}

/** The moment a review starts, to pass to reviewSecondsSince later. */
export function reviewStartedNow(): number {
  return Date.now();
}

/** reviewSeconds up to now. */
export function reviewSecondsSince(openedAt: number | undefined): number | undefined {
  return reviewSeconds(openedAt, Date.now());
}
