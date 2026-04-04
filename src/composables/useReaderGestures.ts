/**
 * 阅读器手势 composable（简化版）
 *
 * 仅处理非 iframe 区域的点击（如 header、footer、modal）
 * iframe 内部的手势由 useIframeGestures 处理
 */

import type { Ref } from "vue";
import { PAGE_CHANGE_COOLDOWN_MS, TAP_ZONE_LEFT, TAP_ZONE_RIGHT } from "../utils/constants";

interface GestureHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onTap?: (x: number, y: number) => void;
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

  let pageChangeCooldown = false;

  /**
   * 处理来自 iframe 的手势事件（通过 emit 传递）
   */
  function handleIframeTap(x: number, y: number) {
    if (uiStore?.activeModal) {
      uiStore.closeModal();
      return;
    }

    if (isPaginationMode.value) {
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

    handlers.onTap?.(x, y);
  }

  /**
   * 处理来自 iframe 的滑动事件
   */
  function handleIframeSwipe(direction: "left" | "right") {
    if (uiStore?.activeModal) {
      uiStore.closeModal();
      return;
    }

    if (isPaginationMode.value && !pageChangeCooldown) {
      if (direction === "left") {
        handlers.onSwipeLeft?.();
      } else {
        handlers.onSwipeRight?.();
      }
    }
  }

  /**
   * 设置翻页冷却
   */
  function setPageChangeCooldown() {
    if (pageChangeCooldown) return;
    pageChangeCooldown = true;
    setTimeout(() => {
      pageChangeCooldown = false;
    }, PAGE_CHANGE_COOLDOWN_MS);
  }

  return {
    handleIframeTap,
    handleIframeSwipe,
    setPageChangeCooldown,
  };
}
