import { useEffect, useRef, type DependencyList, type RefObject } from 'react';
import { LogicalSize, currentMonitor, getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';

const MIN_SETUP_WINDOW_WIDTH = 800;
const MIN_SETUP_WINDOW_HEIGHT = 600;
const MAX_WORKAREA_WIDTH_RATIO = 0.9;
const MAX_WORKAREA_HEIGHT_RATIO = 0.92;
const EXTRA_HORIZONTAL_MARGIN = 64;
const RESIZE_EPSILON = 8;
const MANUAL_RESIZE_GRACE_MS = 400;
const PROGRAMMATIC_RESIZE_GRACE_MS = 400;

interface UseSetupWindowSizingOptions {
  headerRef: RefObject<HTMLElement | null>;
  progressRef: RefObject<HTMLElement | null>;
  mainRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  dependencies: DependencyList;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function getMonitorBounds() {
  const monitor = await currentMonitor() ?? await primaryMonitor();
  const scaleFactor = monitor?.scaleFactor || window.devicePixelRatio || 1;
  const workAreaWidth = monitor?.workArea.size.width
    ? monitor.workArea.size.width / scaleFactor
    : window.screen.availWidth;
  const workAreaHeight = monitor?.workArea.size.height
    ? monitor.workArea.size.height / scaleFactor
    : window.screen.availHeight;

  return {
    maxWidth: Math.max(
      MIN_SETUP_WINDOW_WIDTH,
      Math.floor(workAreaWidth * MAX_WORKAREA_WIDTH_RATIO),
    ),
    maxHeight: Math.max(
      MIN_SETUP_WINDOW_HEIGHT,
      Math.floor(workAreaHeight * MAX_WORKAREA_HEIGHT_RATIO),
    ),
  };
}

export function useSetupWindowSizing({
  headerRef,
  progressRef,
  mainRef,
  contentRef,
  dependencies,
}: UseSetupWindowSizingOptions) {
  const lastRequestedSizeRef = useRef<{ width: number; height: number } | null>(null);
  const suppressManualResizeUntilRef = useRef(0);
  const suppressProgrammaticResizeUntilRef = useRef(0);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    const appWindow = getCurrentWindow();
    let resizeFrame: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let cancelled = false;

    const runResize = async () => {
      if (cancelled || Date.now() < suppressManualResizeUntilRef.current) {
        return;
      }

      const header = headerRef.current;
      const progress = progressRef.current;
      const main = mainRef.current;
      const content = contentRef.current;

      if (!header || !progress || !main || !content) {
        return;
      }

      try {
        const [isFullscreen, isMaximized, bounds] = await Promise.all([
          appWindow.isFullscreen(),
          appWindow.isMaximized(),
          getMonitorBounds(),
        ]);

        if (isFullscreen || isMaximized) {
          return;
        }

        const mainStyles = window.getComputedStyle(main);
        const verticalPadding = parseFloat(mainStyles.paddingTop) + parseFloat(mainStyles.paddingBottom);
        const horizontalPadding = parseFloat(mainStyles.paddingLeft) + parseFloat(mainStyles.paddingRight);

        const contentHeight = Math.ceil(Math.max(content.scrollHeight, content.getBoundingClientRect().height));
        const contentWidth = Math.ceil(Math.max(content.scrollWidth, content.getBoundingClientRect().width));

        const desiredWidth = Math.ceil(contentWidth + horizontalPadding + EXTRA_HORIZONTAL_MARGIN);
        const desiredHeight = Math.ceil(
          header.getBoundingClientRect().height +
          progress.getBoundingClientRect().height +
          verticalPadding +
          contentHeight,
        );

        const targetWidth = clamp(desiredWidth, MIN_SETUP_WINDOW_WIDTH, bounds.maxWidth);
        const targetHeight = clamp(desiredHeight, MIN_SETUP_WINDOW_HEIGHT, bounds.maxHeight);
        const lastRequested = lastRequestedSizeRef.current;

        if (
          lastRequested &&
          Math.abs(lastRequested.width - targetWidth) < RESIZE_EPSILON &&
          Math.abs(lastRequested.height - targetHeight) < RESIZE_EPSILON
        ) {
          return;
        }

        if (
          Math.abs(window.innerWidth - targetWidth) < RESIZE_EPSILON &&
          Math.abs(window.innerHeight - targetHeight) < RESIZE_EPSILON
        ) {
          lastRequestedSizeRef.current = { width: targetWidth, height: targetHeight };
          return;
        }

        suppressProgrammaticResizeUntilRef.current = Date.now() + PROGRAMMATIC_RESIZE_GRACE_MS;
        await appWindow.setSize(new LogicalSize(targetWidth, targetHeight));
        lastRequestedSizeRef.current = { width: targetWidth, height: targetHeight };
      } catch (error) {
        console.warn('Failed to resize setup window', error);
      }
    };

    const scheduleResize = () => {
      if (cancelled) {
        return;
      }

      if (resizeFrame !== null) {
        cancelAnimationFrame(resizeFrame);
      }

      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        void runResize();
      });
    };

    const unlistenPromise = appWindow.onResized(() => {
      if (Date.now() < suppressProgrammaticResizeUntilRef.current) {
        return;
      }

      suppressManualResizeUntilRef.current = Date.now() + MANUAL_RESIZE_GRACE_MS;
    });

    const observedContent = contentRef.current;
    resizeObserver = new ResizeObserver(() => {
      scheduleResize();
    });
    if (observedContent) {
      resizeObserver.observe(observedContent);
    }

    scheduleResize();

    return () => {
      cancelled = true;
      if (resizeFrame !== null) {
        cancelAnimationFrame(resizeFrame);
      }
      resizeObserver?.disconnect();
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [contentRef, headerRef, mainRef, progressRef, ...dependencies]);
}
