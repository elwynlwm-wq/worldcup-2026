import { useState } from 'preact/hooks';

/**
 * Throwaway demo island proving the Preact interactivity path works.
 * Real islands (prediction widgets, brackets, live tickers) follow this shape:
 * a small interactive component hydrated only where needed via client:* directives.
 * Delete once a real island exists. See docs/architecture.md (live islands).
 */
export default function Counter({ start = 0 }: { start?: number }) {
  const [count, setCount] = useState(start);
  return (
    <button
      type="button"
      onClick={() => setCount((c) => c + 1)}
      class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
    >
      Clicked {count} time{count === 1 ? '' : 's'}
    </button>
  );
}
