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
  const runIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [state, setState] = useState<AsyncDataState<T>>({ status: "idle", data: null, error: null });

  useEffect(() => {
    const ac = new AbortController();
    runIdRef.current += 1;
    const currentRunId = runIdRef.current;
    setState((prev) => ({ status: "loading", data: prev.data, error: null }));

    (async () => {
      try {
        const data = await loader(ac.signal);
        if (!mountedRef.current || currentRunId !== runIdRef.current) return;
        setState({ status: "success", data, error: null });
      } catch (e) {
        if (!mountedRef.current || currentRunId !== runIdRef.current) return;
        setState((prev) => ({ status: "error", data: prev.data, error: e }));
      }
    })();

    return () => {
    };
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((x) => x + 1), []);

  return useMemo(() => ({ state, reload }), [state, reload]);
}
