import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { authenticationSession } from './AuthenticationService';
import { AccountQueryStore, QueryFetcher, QuerySnapshot } from './data/AccountQueryStore';

const queryStore = new AccountQueryStore(() => Date.now());
queryStore.setAccount(authenticationSession.getSnapshot().accountIdentifier);
const unsubscribeAuthentication = authenticationSession.subscribe(() => queryStore.setAccount(authenticationSession.getSnapshot().accountIdentifier));
declare const module: { readonly hot?: { dispose(callback: () => void): void } };
module.hot?.dispose(() => { unsubscribeAuthentication(); queryStore.clear(); });
export const invalidateCache = (key: string): void => queryStore.invalidate(key);
export const useDataScope = (): object => useSyncExternalStore(queryStore.subscribeScope, queryStore.getScope, queryStore.getScope);

export function useData<Value>(key: string, fetcher?: QueryFetcher<Value>, initialData?: Value) {
  const scope = useDataScope();
  const valid = key.trim().length > 0;
  const fetcherReference = useRef(fetcher);
  const initialReference = useRef(initialData);
  fetcherReference.current = fetcher;
  initialReference.current = initialData;
  const [state, setState] = useState(() => ({ key, scope, snapshot: queryStore.read<Value>(key) }));
  const hasFetcher = fetcher !== undefined;
  useEffect(() => {
    if (!valid) return;
    return queryStore.observe<Value>(key, scope, snapshot => setState({ key, scope, snapshot }),
      hasFetcher ? signal => fetcherReference.current!(signal) : undefined, initialReference.current);
  }, [key, scope, valid, hasFetcher]);
  const updateData = useCallback((value: Value) => {
    if (valid) queryStore.update(key, scope, value);
  }, [key, scope, valid]);
  const snapshot: QuerySnapshot<Value> = valid && state.key === key && state.scope === scope
    ? state.snapshot : { data: null, loading: hasFetcher, error: null };
  return { ...snapshot, updateData };
}
