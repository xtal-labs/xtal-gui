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
  /** Emoji representation of the fruit */
  emoji: string;
}

export const FRUIT_COLORS: Record<string, FruitColorScheme> = {
  Apple: {
    bg: "from-red-500/20 to-red-600/10",
    border: "border-red-500/30",
    glow: "shadow-red-500/20",
    icon: "text-red-500",
    emoji: "\ud83c\udf4e",
  },
  Orange: {
    bg: "from-orange-500/20 to-orange-600/10",
    border: "border-orange-500/30",
    glow: "shadow-orange-500/20",
    icon: "text-orange-500",
    emoji: "\ud83c\udf4a",
  },
  Pear: {
    bg: "from-lime-500/20 to-lime-600/10",
    border: "border-lime-500/30",
    glow: "shadow-lime-500/20",
    icon: "text-lime-500",
    emoji: "\ud83c\udf50",
  },
  Strawberry: {
    bg: "from-pink-500/20 to-pink-600/10",
    border: "border-pink-500/30",
    glow: "shadow-pink-500/20",
    icon: "text-pink-500",
    emoji: "\ud83c\udf53",
  },
  Grape: {
    bg: "from-violet-500/20 to-violet-600/10",
    border: "border-violet-500/30",
    glow: "shadow-violet-500/20",
    icon: "text-violet-500",
    emoji: "\ud83c\udf47",
  },
  Peach: {
    bg: "from-orange-400/20 to-orange-500/10",
    border: "border-orange-400/30",
    glow: "shadow-orange-400/20",
    icon: "text-orange-400",
    emoji: "\ud83c\udf51",
  },
  Pineapple: {
    bg: "from-yellow-500/20 to-yellow-600/10",
    border: "border-yellow-500/30",
    glow: "shadow-yellow-500/20",
    icon: "text-yellow-500",
    emoji: "\ud83c\udf4d",
  },
  Kiwi: {
    bg: "from-lime-400/20 to-amber-700/10",
    border: "border-lime-400/30",
    glow: "shadow-lime-400/20",
    icon: "text-lime-400",
    emoji: "\ud83e\udd5d",
  },
  Watermelon: {
    bg: "from-emerald-500/20 to-red-500/10",
    border: "border-emerald-500/30",
    glow: "shadow-emerald-500/20",
    icon: "text-emerald-500",
    emoji: "\ud83c\udf49",
  },
};

/** Default color scheme for unknown fruit types */
const DEFAULT_FRUIT_COLOR: FruitColorScheme = {
  bg: "from-gray-500/20 to-gray-600/10",
  border: "border-gray-500/30",
  glow: "shadow-gray-500/20",
  icon: "text-gray-500",
  emoji: "\ud83c\udf52",
};

/**
 * Get the color scheme for a fruit type.
 * Returns a default gray scheme for unknown fruit types.
 */
export function getFruitColor(fruitType: string): FruitColorScheme {
  return FRUIT_COLORS[fruitType] ?? DEFAULT_FRUIT_COLOR;
}
