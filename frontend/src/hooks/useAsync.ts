import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "@/api/client";

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = [], options?: { pollMs?: number }) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const result = await loader();
      setData(result);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    setLoading(true);
    reload();
    if (!options?.pollMs) return;
    const timer = setInterval(reload, options.pollMs);
    return () => clearInterval(timer);
  }, [reload, options?.pollMs]);

  return { data, loading, error, reload, setData };
}
