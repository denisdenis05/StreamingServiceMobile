import { useState, useEffect, useRef, useCallback } from 'react';

const globalCache: Record<string, any> = {};
const subscribers: Record<string, Set<(data: any) => void>> = {};
const activePromises: Record<string, Promise<any> | undefined> = {};
const fetchTriggers: Record<string, Set<() => void>> = {};

export const invalidateCache = (key: string) => {
  delete globalCache[key];
  fetchTriggers[key]?.forEach(trigger => trigger());
};

export const useData = <T,>(
    key: string,
    fetcher?: () => Promise<T>,
    initialData?: T
) => {
    const isValidKey = !!(key && typeof key === 'string' && key.trim().length > 0);

    if (isValidKey && initialData !== undefined && !(key in globalCache)) {
        globalCache[key] = initialData;
    }

    const [data, setData] = useState<T | null>(isValidKey ? (globalCache[key] ?? null) : null);
    const [loading, setLoading] = useState<boolean>(
        isValidKey && !(key in globalCache) && !!fetcher
    );
    const [error, setError] = useState<Error | null>(null);

    const fetcherRef = useRef(fetcher);
    useEffect(() => {
        fetcherRef.current = fetcher;
    }, [fetcher]);

    useEffect(() => {
        if (!isValidKey) return;

        if (!subscribers[key]) {
            subscribers[key] = new Set();
        }

        const callback = (newData: T) => {
            setData(newData);
        };
        subscribers[key].add(callback);

        return () => {
            if (subscribers[key]) {
                subscribers[key].delete(callback);
                if (subscribers[key].size === 0) {
                    delete subscribers[key];
                }
            }
        };
    }, [key, isValidKey]);

    useEffect(() => {
        if (!isValidKey) return;

        const loadData = async () => {
            if (globalCache[key] !== undefined && globalCache[key] !== null) {
                setLoading(false);
                setData(globalCache[key]);
                return;
            }

            if (!fetcherRef.current) {
                setLoading(false);
                return;
            }

            if (activePromises[key]) {
                try {
                    setLoading(true);
                    await activePromises[key];
                    const cached = globalCache[key];
                    if (cached !== undefined) setData(cached);
                } catch (err) {
                    setError(err as Error);
                } finally {
                    setLoading(false);
                }
                return;
            }

            setLoading(true);
            const promise = fetcherRef.current();
            activePromises[key] = promise;

            try {
                const result = await promise;
                globalCache[key] = result;

                if (subscribers[key]) {
                    subscribers[key].forEach(cb => cb(result));
                }
                setData(result);
            } catch (err) {
                console.error(`DataProvider fetch error for key "${key}":`, err);
                setError(err as Error);
            } finally {
                setLoading(false);
                delete activePromises[key];
            }
        };

        // Register for invalidation so mounted components refetch when cache is cleared
        if (!fetchTriggers[key]) fetchTriggers[key] = new Set();
        fetchTriggers[key].add(loadData);

        loadData();

        return () => {
            fetchTriggers[key]?.delete(loadData);
            if (fetchTriggers[key]?.size === 0) delete fetchTriggers[key];
        };
    }, [key, isValidKey]);

    const updateData = useCallback(
        (newData: T) => {
            if (!isValidKey) return;
            globalCache[key] = newData;
            if (subscribers[key]) {
                subscribers[key].forEach(cb => cb(newData));
            }
            setData(newData);
        },
        [key, isValidKey]
    );

    return { data, loading, error, updateData };
};
