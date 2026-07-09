import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 25's experimental built-in `localStorage` global conflicts with
// jsdom's own window.localStorage in this test environment (surfaces as
// "removeItem is not a function" — Node's built-in requires a
// --localstorage-file path we don't set and don't want, since tests must
// stay hermetic). A minimal, explicit in-memory Storage shim sidesteps the
// conflict entirely rather than fighting Node/jsdom version interactions.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

Object.defineProperty(window, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
