import type { StorefrontApi } from './api';
import type { Store } from './types';

const stores = new Map<string, Promise<Store>>();

/** One GET /store per key per page, shared by every button using that key. A failure is forgotten, so it can be tried again. */
export function getStore(api: StorefrontApi): Promise<Store> {
  const id = api.base + '|' + api.key;
  let store = stores.get(id);
  if (!store) {
    store = api.store();
    stores.set(id, store);
    store.catch(() => stores.delete(id));
  }
  return store;
}
