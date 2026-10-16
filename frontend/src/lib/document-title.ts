import { useEffect } from 'react';

/**
 * Sets the document title and resets it on unmount.
 * @param title The title to set.
 * @param fallback Fallback title if title is falsy (defaults to site name).
 */
export function useDocumentTitle(title: string, fallback = 'DRCIP - Disaster Response & Coordination Platform'): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title || fallback;
    return () => {
      document.title = previousTitle;
    };
  }, [title, fallback]);
}
