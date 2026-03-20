// Composable for handling touch gestures in reader

import type { Ref } from "vue";
import {
  SWIPE_THRESHOLD,
  PAGE_CHANGE_COOLDOWN_MS,
  TAP_ZONE_LEFT,
  TAP_ZONE_RIGHT,
} from "../utils/constants";

interface GestureHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onTap?: (e: MouseEvent) => void;
  onTapLeft?: () => void;
  onTapRight?: () => void;
  onTapCenter?: () => void;
}

interface UseReaderGesturesOptions {
  isPaginationMode: Ref<boolean>;
  uiStore?: {
    activeModal: string | null;
    closeModal: () => void;
  };
  handlers: GestureHandlers;
}

export function useReaderGestures(options: UseReaderGesturesOptions) {
  const { isPaginationMode, uiStore, handlers } = options;

  let touchStartX = 0;
  let touchStartY = 0;
  let pageChangeCooldown = false;

  function handleTouchStart(e: TouchEvent) {
    const target = e.target as HTMLElement;
    if (target.closest(".modal-overlay") || target.closest(".modal-content")) return;

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function handleTouchEnd(e: TouchEvent) {
    const target = e.target as HTMLElement;
    if (target.closest(".modal-overlay") || target.closest(".modal-content")) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    const isHorizontalSwipe =
      Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > SWIPE_THRESHOLD;
    const isVerticalSwipe = Math.abs(diffY) > SWIPE_THRESHOLD;

    if (uiStore?.activeModal) {
      if (isHorizontalSwipe || isVerticalSwipe) {
        uiStore.closeModal();
      }
      return;
    }

    if (isPaginationMode.value) {
      if (isHorizontalSwipe) {
        if (pageChangeCooldown) return;
        if (diffX > 0) {
          handlers.onSwipeRight?.();
        } else {
          handlers.onSwipeLeft?.();
        }
        return;
      }
    }
  }

  function handleTap(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (
      target.closest(".modal-overlay") ||
      target.closest(".modal-content") ||
      target.closest(".reader-header") ||
      target.closest(".reader-footer") ||
      target.closest(".progress-bar") ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest("label")
    )
      return;

    if (uiStore?.activeModal) {
      uiStore.closeModal();
      return;
    }

    if (isPaginationMode.value) {
      const x = e.clientX;
      const width = window.innerWidth;
      const leftZone = width * TAP_ZONE_LEFT;
      const rightZone = width * TAP_ZONE_RIGHT;

      if (x < leftZone) {
        if (!pageChangeCooldown) handlers.onTapLeft?.();
      } else if (x > rightZone) {
        if (!pageChangeCooldown) handlers.onTapRight?.();
      } else {
        handlers.onTapCenter?.();
      }
      return;
    }

    handlers.onTap?.(e);
  }

  function setPageChangeCooldown() {
    if (pageChangeCooldown) return;
    pageChangeCooldown = true;
    setTimeout(() => {
      pageChangeCooldown = false;
    }, PAGE_CHANGE_COOLDOWN_MS);
  }

  return {
    handleTouchStart,
    handleTouchEnd,
    handleTap,
    setPageChangeCooldown,
  };
}
