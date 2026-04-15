import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme, type Theme } from "./ThemeProvider";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  variant?: "icon" | "dropdown" | "segmented";
  className?: string;
}

export function ThemeToggle({
  variant = "icon",
  className,
}: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  if (variant === "segmented") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1 rounded-lg bg-muted p-1",
          className
        )}
      >
        <ThemeButton
          active={theme === "celestite"}
          onClick={() => setTheme("celestite")}
          label="Light"
        >
          <Sun className="h-4 w-4" />
        </ThemeButton>
        <ThemeButton
          active={theme === "system"}
          onClick={() => setTheme("system")}
          label="System"
        >
          <Monitor className="h-4 w-4" />
        </ThemeButton>
        <ThemeButton
          active={theme === "amethyst"}
          onClick={() => setTheme("amethyst")}
          label="Dark"
        >
          <Moon className="h-4 w-4" />
        </ThemeButton>
      </div>
    );
  }

  // Icon toggle - cycles through themes
  const cycleTheme = () => {
    const themes: Theme[] = ["celestite", "system", "amethyst"];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  return (
    <button
      onClick={cycleTheme}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-lg",
        "bg-transparent hover:bg-muted",
        "text-foreground-secondary hover:text-foreground",
        "transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      aria-label={`Current theme: ${theme}. Click to change.`}
    >
      {/* Sun icon */}
      <Sun
        className={cn(
          "absolute h-5 w-5 transition-all duration-300",
          resolvedTheme === "celestite"
            ? "rotate-0 scale-100 opacity-100"
            : "rotate-90 scale-0 opacity-0"
        )}
      />
      {/* Moon icon */}
      <Moon
        className={cn(
          "absolute h-5 w-5 transition-all duration-300",
          resolvedTheme === "amethyst"
            ? "rotate-0 scale-100 opacity-100"
            : "-rotate-90 scale-0 opacity-0"
        )}
      />
      {/* System indicator - show as small badge when in system mode */}
      {theme === "system" && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
          A
        </span>
      )}
    </button>
  );
}

interface ThemeButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}

function ThemeButton({ active, onClick, label, children }: ThemeButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md",
        "transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-foreground-muted hover:text-foreground-secondary"
      )}
      aria-label={label}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

export default ThemeToggle;
