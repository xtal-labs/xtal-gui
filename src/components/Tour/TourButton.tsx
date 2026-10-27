import { CircleHelp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTourStore } from "@/stores";
import { TOUR_CHAPTERS } from "./chapters";
import type { TourChapterId } from "./types";

/** Page-header button that replays one chapter of the walkthrough. */
export function TourButton({ chapter }: { chapter: TourChapterId }) {
  const start = useTourStore((state) => state.start);
  const seen = useTourStore((state) => state.completed.includes(chapter));

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => void start([chapter])}
          aria-label={`${TOUR_CHAPTERS[chapter].title} walkthrough`}
        >
          <CircleHelp className="h-4 w-4 text-foreground-muted" />
          {/* Marks a chapter the user has not been through yet. */}
          {!seen && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>How this page works</TooltipContent>
    </Tooltip>
  );
}
