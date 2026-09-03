/**
 * Shared fruit color definitions for consistent styling across the application.
 * Used by Validator component and fruit toast notifications.
 */

export interface FruitColorScheme {
  /** Tailwind gradient classes for background (e.g., "from-red-500/20 to-red-600/10") */
  bg: string;
  /** Tailwind border class (e.g., "border-red-500/30") */
  border: string;
  /** Tailwind shadow class for glow effect (e.g., "shadow-red-500/20") */
  glow: string;
  /** Tailwind text color class for icons (e.g., "text-red-500") */
  icon: string;
  /**
   * Base HSL triplet of the same hue (e.g. "0 84% 60%"), for contexts that need a
   * raw colour rather than a class: `hsl(var(--x))` fills, and the `--gem-*`
   * custom properties `.hex-gem` consumes. See {@link fruitGemVars}.
   */
  hsl: string;
  /** Emoji representation of the fruit */
  emoji: string;
}

export const FRUIT_COLORS: Record<string, FruitColorScheme> = {
  Apple: {
    bg: "from-red-500/20 to-red-600/10",
    border: "border-red-500/30",
    glow: "shadow-red-500/20",
    icon: "text-red-500",
    hsl: "0 84% 60%",
    emoji: "\ud83c\udf4e",
  },
  Orange: {
    bg: "from-orange-500/20 to-orange-600/10",
    border: "border-orange-500/30",
    glow: "shadow-orange-500/20",
    icon: "text-orange-500",
    hsl: "25 95% 53%",
    emoji: "\ud83c\udf4a",
  },
  Pear: {
    bg: "from-lime-500/20 to-lime-600/10",
    border: "border-lime-500/30",
    glow: "shadow-lime-500/20",
    icon: "text-lime-500",
    hsl: "84 81% 44%",
    emoji: "\ud83c\udf50",
  },
  Strawberry: {
    bg: "from-pink-500/20 to-pink-600/10",
    border: "border-pink-500/30",
    glow: "shadow-pink-500/20",
    icon: "text-pink-500",
    hsl: "330 81% 60%",
    emoji: "\ud83c\udf53",
  },
  Grape: {
    bg: "from-violet-500/20 to-violet-600/10",
    border: "border-violet-500/30",
    glow: "shadow-violet-500/20",
    icon: "text-violet-500",
    hsl: "258 90% 66%",
    emoji: "\ud83c\udf47",
  },
  Peach: {
    bg: "from-orange-400/20 to-orange-500/10",
    border: "border-orange-400/30",
    glow: "shadow-orange-400/20",
    icon: "text-orange-400",
    hsl: "27 96% 61%",
    emoji: "\ud83c\udf51",
  },
  Pineapple: {
    bg: "from-yellow-500/20 to-yellow-600/10",
    border: "border-yellow-500/30",
    glow: "shadow-yellow-500/20",
    icon: "text-yellow-500",
    hsl: "45 93% 47%",
    emoji: "\ud83c\udf4d",
  },
  Kiwi: {
    bg: "from-lime-400/20 to-amber-700/10",
    border: "border-lime-400/30",
    glow: "shadow-lime-400/20",
    icon: "text-lime-400",
    hsl: "83 78% 55%",
    emoji: "\ud83e\udd5d",
  },
  Watermelon: {
    bg: "from-emerald-500/20 to-red-500/10",
    border: "border-emerald-500/30",
    glow: "shadow-emerald-500/20",
    icon: "text-emerald-500",
    hsl: "160 84% 39%",
    emoji: "\ud83c\udf49",
  },
};

/** Default color scheme for unknown fruit types */
const DEFAULT_FRUIT_COLOR: FruitColorScheme = {
  bg: "from-gray-500/20 to-gray-600/10",
  border: "border-gray-500/30",
  glow: "shadow-gray-500/20",
  icon: "text-gray-500",
  hsl: "220 9% 46%",
  emoji: "\ud83c\udf52",
};

/**
 * Get the color scheme for a fruit type.
 * Returns a default gray scheme for unknown fruit types.
 */
export function getFruitColor(fruitType: string): FruitColorScheme {
  return FRUIT_COLORS[fruitType] ?? DEFAULT_FRUIT_COLOR;
}

/**
 * Lightness offsets that turn a fruit's single base hue into the four faces
 * `.hex-gem` needs. Mirrors the relationship the `--crystal-*-specular` /
 * `-highlight` / `-shadow` tokens have to their base in globals.css.
 */
const GEM_LIGHTNESS_DELTA = {
  "--gem-specular": 28,
  "--gem-highlight": 14,
  "--gem-base": 0,
  "--gem-shadow": -18,
} as const;

/** Shift the lightness of an "H S% L%" triplet, clamped to a usable range. */
function shiftLightness(hsl: string, delta: number): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length !== 3) return hsl;
  const lightness = Number.parseFloat(parts[2]);
  if (Number.isNaN(lightness)) return hsl;
  const shifted = Math.min(96, Math.max(6, lightness + delta));
  return `${parts[0]} ${parts[1]} ${shifted}%`;
}

/**
 * CSS custom properties driving the `.hex-gem` facet gradients for a fruit type.
 *
 * The `Badge` component has a faceted-hexagon path, but it is gated on a
 * `GEM_COLORS` map covering only the stem/leaf/fruit variants — it cannot express
 * the nine fruit types. Per-fruit gems therefore set these variables directly.
 */
export function fruitGemVars(fruitType: string): Record<string, string> {
  const { hsl } = getFruitColor(fruitType);
  return Object.fromEntries(
    Object.entries(GEM_LIGHTNESS_DELTA).map(([name, delta]) => [
      name,
      shiftLightness(hsl, delta),
    ]),
  );
}
