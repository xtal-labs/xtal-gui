/**
 * Fruit-type chips: the legend and the filter in one control, carrying live counts
 * for the epoch on screen. Selecting a type dims every other gem rather than
 * removing it, so the shape of the epoch stays readable while you pick a type out
 * of it.
 */
import { cn } from "@/lib/utils";
import { FRUIT_COLORS, getFruitColor } from "@/lib/fruitColors";

interface TypeChipsProps {
  /** Lower-cased fruit type → number of gems rendered for it. */
  counts: ReadonlyMap<string, number>;
  selected: string | null;
  onSelect: (type: string | null) => void;
}

export function TypeChips({ counts, selected, onSelect }: TypeChipsProps) {
  const present = Object.keys(FRUIT_COLORS).filter(
    (name) => (counts.get(name.toLowerCase()) ?? 0) > 0,
  );

  if (present.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {present.map((name) => {
        const key = name.toLowerCase();
        const color = getFruitColor(name);
        const isSelected = selected === key;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(isSelected ? null : key)}
            aria-pressed={isSelected}
            className={cn(
              "chamfered-sm inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[11px] transition-colors",
              isSelected
                ? "font-bold text-foreground"
                : "bg-card text-foreground-secondary hover:text-foreground",
            )}
            style={
              isSelected
                ? { backgroundColor: `hsl(${color.hsl} / 0.18)` }
                : undefined
            }
          >
            <span
              className="diamond h-2 w-2 shrink-0"
              style={{ backgroundColor: `hsl(${color.hsl})` }}
              aria-hidden
            />
            <span aria-hidden>{color.emoji}</span>
            <span>{name}</span>
            <span className="font-normal text-foreground-muted">
              {counts.get(key) ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default TypeChips;
