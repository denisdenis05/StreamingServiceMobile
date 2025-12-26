import { useState, useEffect, useRef, useCallback } from 'react';

// Singleton cache storage
const globalCache: Record<string, any> = {};
const subscribers: Record<string, Set<(data: any) => void>> = {};
const activePromises: Record<string, Promise<any> | undefined> = {};

/**
 * Hook to access and manage cached data.
 *
 * @param key Unique key for the data.
 * @param fetcher Optional function to fetch data if not found in cache.
 * @param initialData Optional initial data to populate cache if empty.
 * @returns Object containing data, loading state, error, and update function.
 */
export const useData = <T,>(
    key: string,
    fetcher?: () => Promise<T>,
    initialData?: T
) => {
    // Initialize cache with initialData if provided and cache is empty
    if (initialData !== undefined && !(key in globalCache)) {
        globalCache[key] = initialData;
    }

    const [data, setData] = useState<T | null>(globalCache[key] ?? null);
    const [loading, setLoading] = useState<boolean>(
        !(key in globalCache) && !!fetcher
    );
    const [error, setError] = useState<Error | null>(null);

    // Use ref for fetcher to avoid re-triggering effect on render if fetcher is unstable
    const fetcherRef = useRef(fetcher);
    useEffect(() => {
        fetcherRef.current = fetcher;
    }, [fetcher]);

    // Subscribe to updates
    useEffect(() => {
        if (!subscribers[key]) {
            subscribers[key] = new Set();
        }

        const callback = (newData: T) => {
            setData(newData);
        };
        subscribers[key].add(callback);

        return () => {
            subscribers[key]?.delete(callback);
        };
    }, [key]);

    // Fetch data if needed
    useEffect(() => {
        const loadData = async () => {
            // If we have data, we are done
            if (globalCache[key] !== undefined && globalCache[key] !== null) {
                setLoading(false);
                setData(globalCache[key]);
                return;
            }

            // If no fetcher, nothing to do (waiting for manual update)
            if (!fetcherRef.current) {
                setLoading(false);
                return;
            }

            // If already fetching, wait for it
            if (activePromises[key]) {
                try {
                    setLoading(true);
                    const result = await activePromises[key];
                    // Subscription will handle setData, but we ensure consistency here
                    if (globalCache[key] !== result) {
                        // In case promise resolved but somehow cache differed (unlikely in this flow)
                    }
                } catch (err) {
                    setError(err as Error);
                } finally {
                    setLoading(false);
                }
                return;
            }

            // Start new fetch
            setLoading(true);
            const promise = fetcherRef.current();
            activePromises[key] = promise;

            try {
                const result = await promise;
                globalCache[key] = result;

                // Notify all subscribers
                if (subscribers[key]) {
                    subscribers[key].forEach(cb => cb(result));
                }

                // Also set local state in case subscription missed (run before subscribe? unlikely due to effect order but safe)
                setData(result);
            } catch (err) {
                console.error(`DataProvider fetch error for key "${key}":`, err);
                setError(err as Error);
            } finally {
                setLoading(false);
                delete activePromises[key];
            }
        };

        loadData();
    }, [key]); // Only key. If fetcher changes, we don't re-fetch unless key changes or manual reload.

    const updateData = useCallback(
        (newData: T) => {
            globalCache[key] = newData;
            if (subscribers[key]) {
                subscribers[key].forEach(cb => cb(newData));
            }
            setData(newData);
        },
        [key]
    );

    return { data, loading, error, updateData };
};
