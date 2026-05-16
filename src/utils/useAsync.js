import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Centralizza fetch/async: stato loading/error/data + execute manuale.
 * @param {(...args: unknown[]) => Promise<*>} asyncFn
 * @param {unknown[]} deps — dipendenze per ricreare execute
 * @param {{ immediate?: boolean, initialData?: unknown }} options
 */
export function useAsync(asyncFn, deps = [], options = {}) {
  const { immediate = false, initialData = null } = options;
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(immediate ? "loading" : "idle");
  const mountedRef = useRef(true);
  const asyncFnRef = useRef(asyncFn);

  asyncFnRef.current = asyncFn;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(async (...args) => {
    setStatus("loading");
    setError(null);
    try {
      const result = await asyncFnRef.current(...args);
      if (mountedRef.current) {
        setData(result);
        setStatus("success");
      }
      return result;
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        setStatus("error");
      }
      throw err;
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (immediate) execute();
  }, [immediate, execute]);

  return {
    data,
    setData,
    error,
    status,
    isLoading: status === "loading",
    isIdle: status === "idle",
    isSuccess: status === "success",
    isError: status === "error",
    execute,
  };
}
