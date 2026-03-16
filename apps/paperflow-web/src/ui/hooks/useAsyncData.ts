import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type AsyncDataState<T> =
  | { status: "idle"; data: null; error: null }
  | { status: "loading"; data: T | null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: T | null; error: unknown };

export type UseAsyncDataResult<T> = {
  state: AsyncDataState<T>;
  reload: () => void;
};

export function useAsyncData<T>(loader: (signal: AbortSignal) => Promise<T>, deps: unknown[]): UseAsyncDataResult<T> {
  const [nonce, setNonce] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [state, setState] = useState<AsyncDataState<T>>({ status: "idle", data: null, error: null });

  useEffect(() => {
    const ac = new AbortController();
    setState((prev) => ({ status: "loading", data: prev.data, error: null }));

    (async () => {
      try {
        const data = await loader(ac.signal);
        if (!mountedRef.current || ac.signal.aborted) return;
        setState({ status: "success", data, error: null });
      } catch (e) {
        if (!mountedRef.current || ac.signal.aborted) return;
        setState((prev) => ({ status: "error", data: prev.data, error: e }));
      }
    })();

    return () => {
      ac.abort();
    };
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((x) => x + 1), []);

  return useMemo(() => ({ state, reload }), [state, reload]);
}
