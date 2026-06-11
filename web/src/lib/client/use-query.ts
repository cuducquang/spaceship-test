"use client";

import { useEffect, useRef, useState } from "react";
import type { QueryResult, QuerySpec } from "@/lib/analytics/specs";

const cache = new Map<string, QueryResult>();
const inflight = new Map<string, Promise<QueryResult>>();

async function fetchQuery(spec: QuerySpec): Promise<QueryResult> {
  const key = JSON.stringify(spec);
  const cached = cache.get(key);
  if (cached) return cached;
  let promise = inflight.get(key);
  if (!promise) {
    promise = (async () => {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Query failed (${res.status})`);
      cache.set(key, json.result);
      return json.result as QueryResult;
    })().finally(() => inflight.delete(key));
    inflight.set(key, promise);
  }
  return promise;
}

export function useQuery(spec: QuerySpec | null) {
  const [data, setData] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(spec));
  const [error, setError] = useState<string | null>(null);
  const specKey = spec ? JSON.stringify(spec) : null;
  const latest = useRef(specKey);

  useEffect(() => {
    latest.current = specKey;
    if (!specKey) {
      // defer so the state reset never lands synchronously inside the effect
      queueMicrotask(() => {
        if (latest.current === specKey) {
          setData(null);
          setLoading(false);
        }
      });
      return;
    }
    queueMicrotask(() => {
      if (latest.current !== specKey) return;
      setLoading(true);
      setError(null);
    });
    fetchQuery(JSON.parse(specKey))
      .then((result) => {
        if (latest.current === specKey) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (latest.current === specKey) {
          setError(err.message);
          setLoading(false);
        }
      });
  }, [specKey]);

  return { data, loading, error };
}
