/// <reference types="vite/client" />

declare module "react" {
  const React: unknown;
  export default React;
  export function useState<T>(initial: T): [T, (v: T | ((p: T) => T)) => void];
  export function useRef<T>(initial: T | null): { current: T | null };
  export function useCallback<T extends (...args: unknown[]) => unknown>(fn: T, deps: unknown[]): T;
  export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  export const StrictMode: (props: { children?: unknown }) => unknown;
}
declare module "react-dom/client" {
  export function createRoot(container: Element | DocumentFragment): { render(children: unknown): void };
}
declare module "react/jsx-runtime" {
  export namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: Record<string, unknown>;
    }
  }
}
