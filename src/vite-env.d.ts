/// <reference types="vite/client" />

declare module 'react-dom/client' {
  export function createRoot(container: Element | DocumentFragment): any;
  export function hydrateRoot(
    container: Element | DocumentFragment,
    element: any
  ): any;
}
