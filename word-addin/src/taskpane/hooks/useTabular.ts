import { useEffect, useState } from "react";
import {
  listTabularReviews,
  getTabularReview,
  type ApiTabularReview,
  type ApiTabularReviewDetail,
} from "../lib/api";

export interface TabularListState {
  reviews: ApiTabularReview[];
  loading: boolean;
  error: string | null;
}

export function useTabularReviews(projectId: string | null): TabularListState {
  const [reviews, setReviews] = useState<ApiTabularReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listTabularReviews(projectId ?? undefined)
      .then((rows) => {
        if (!cancelled) setReviews(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load reviews");
      })
      .then(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { reviews, loading, error };
}

export interface TabularDetailState {
  detail: ApiTabularReviewDetail | null;
  loading: boolean;
  error: string | null;
}

export function useTabularReview(reviewId: string | null): TabularDetailState {
  const [detail, setDetail] = useState<ApiTabularReviewDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reviewId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTabularReview(reviewId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load review");
      })
      .then(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reviewId]);

  return { detail, loading, error };
}
