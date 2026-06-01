import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query and re-render when it changes.
 *
 * Returns `false` during SSR / before mount, then the live match state.
 *
 * @example
 *   const isCompact = useMediaQuery("(max-width: 767px)");
 */
export function useMediaQuery(query: string): boolean {
  const getMatches = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false;

  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQueryList = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQueryList.matches);

    // Sync immediately in case the query changed between render and effect.
    handleChange();
    mediaQueryList.addEventListener("change", handleChange);

    return () => {
      mediaQueryList.removeEventListener("change", handleChange);
    };
  }, [query]);

  return matches;
}
