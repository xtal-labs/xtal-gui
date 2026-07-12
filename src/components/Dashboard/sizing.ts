import type { WidgetSize } from "@/types/dashboard";

/**
 * Size preset → grid span classes. Static strings so Tailwind can see them.
 *
 * The grid is `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`; all spans are
 * `md:`/`lg:`-prefixed so the compact tier (640–767px) degrades to one column.
 */
export const SIZE_CLASSES: Record<WidgetSize, string> = {
  s: "",
  m: "lg:col-span-2",
  l: "md:col-span-2 lg:col-span-2",
  xl: "md:col-span-2 lg:col-span-4",
};

/**
 * Size preset → primary stat value typography. Lets a widget's headline value
 * (e.g. wallet balance) grow with the card.
 */
export const VALUE_SIZE_CLASSES: Record<WidgetSize, string> = {
  s: "text-2xl",
  m: "text-2xl",
  l: "text-4xl",
  xl: "text-5xl",
};
