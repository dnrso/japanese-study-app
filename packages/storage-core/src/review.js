import { text } from "./values.js";

export const reviewIntervals = {
  "내일": 1,
  "3일 후": 3,
  "일주일": 7,
  "2주일": 14,
  "한달": 30
};

export const reviewStates = ["오늘", ...Object.keys(reviewIntervals), "대기"];

// An empty review is meaningful and must stay empty: source items carry
// review "" by design, and the quiz's "변경 안 함" option sends "" to mean
// "leave the review untouched" (see submitWordQuizAnswer's `&& nextReview`
// guard). Only non-empty unknown values fall back to "대기".
export function normalizeReview(value) {
  const review = text(value);
  if (!review) {
    return "";
  }
  return reviewStates.includes(review) ? review : "대기";
}

export function normalizeCompletionReview(value) {
  const review = normalizeReview(value);
  if (review === "오늘") {
    return "3일 후";
  }
  return reviewIntervals[review] ? review : "";
}

export function normalizeReviewCompletionTargets(targets) {
  if (!Array.isArray(targets)) {
    return [];
  }
  return targets
    .map(target => {
      if (target && typeof target === "object") {
        return {
          id: text(target.id),
          review: normalizeCompletionReview(target.review)
        };
      }
      return { id: text(target), review: "3일 후" };
    })
    .filter(target => target.id && target.review);
}
