import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

import { FULL_TOUR, TOUR_CHAPTERS } from "@/components/Tour/chapters";
import type { TourChapterId } from "@/components/Tour/types";
import { tauriCommand } from "@/hooks/useTauriCommand";
import type { ConsensusParams, TutorialConfig } from "@/types";
import { useUiStore } from "./uiStore";

interface TourState {
  /** Chapters of the walkthrough being shown, in order. Empty when none is. */
  run: TourChapterId[];
  chapterIndex: number;
  stepIndex: number;

  /** Start the full walkthrough once the main shell is up (queued by the setup wizard). */
  pending: boolean;
  /** Ids of finished chapters. Persisted. */
  completed: string[];
  /** Fetched on first start; constant for the life of the process. */
  params: ConsensusParams | null;

  /** Apply the persisted state from get_gui_config. */
  hydrate: (tutorial: TutorialConfig) => void;
  /** Show the given chapters, or the whole walkthrough. */
  start: (chapters?: TourChapterId[]) => Promise<void>;
  next: () => void;
  back: () => void;
  stop: () => void;
}

export const useTourStore = create<TourState>((set, get) => ({
  run: [],
  chapterIndex: 0,
  stepIndex: 0,
  pending: false,
  completed: [],
  params: null,

  hydrate: (tutorial) => set({ pending: tutorial.pending, completed: tutorial.completed }),

  start: async (chapters = FULL_TOUR) => {
    let { params } = get();
    if (!params) {
      try {
        params = await tauriCommand<ConsensusParams>("get_consensus_params");
      } catch (error) {
        // Leave `pending` set so a queued walkthrough is offered again next launch.
        console.error("Failed to load walkthrough parameters:", error);
        useUiStore.getState().addToast({
          type: "error",
          title: "Walkthrough unavailable",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }

    if (get().pending) {
      void invoke("set_gui_tutorial_pending", { pending: false }).catch((error) => {
        console.error("Failed to clear the queued walkthrough:", error);
      });
    }

    // The walkthrough covers the whole window; nothing else should be open under it.
    const ui = useUiStore.getState();
    ui.closeMobileNav();
    ui.closeModal();

    set({ params, pending: false, run: chapters, chapterIndex: 0, stepIndex: 0 });
  },

  next: () => {
    const { run, chapterIndex, stepIndex, completed } = get();
    const chapterId = run[chapterIndex];
    if (!chapterId) return;

    if (stepIndex < TOUR_CHAPTERS[chapterId].steps.length - 1) {
      set({ stepIndex: stepIndex + 1 });
      return;
    }

    // Past a chapter's last step: it counts as finished.
    if (!completed.includes(chapterId)) {
      const nextCompleted = [...completed, chapterId];
      set({ completed: nextCompleted });
      void invoke("set_gui_tutorial_completed", { completed: nextCompleted }).catch((error) => {
        console.error("Failed to save walkthrough progress:", error);
      });
    }

    if (chapterIndex < run.length - 1) {
      set({ chapterIndex: chapterIndex + 1, stepIndex: 0 });
    } else {
      get().stop();
    }
  },

  back: () => {
    const { run, chapterIndex, stepIndex } = get();
    if (stepIndex > 0) {
      set({ stepIndex: stepIndex - 1 });
    } else if (chapterIndex > 0) {
      const previous = TOUR_CHAPTERS[run[chapterIndex - 1]];
      set({ chapterIndex: chapterIndex - 1, stepIndex: previous.steps.length - 1 });
    }
  },

  stop: () => set({ run: [], chapterIndex: 0, stepIndex: 0 }),
}));
