/**
 * iframe 内部手势识别 composable
 *
 * 直接在 iframe document 内处理触摸事件，避免跨文档事件传递的性能损耗
 * 所有事件监听器都使用 passive: true，确保不阻塞主线程
 */

import { SWIPE_THRESHOLD } from "../utils/constants";

export interface IframeGestureHandlers {
  onTap?: (x: number, y: number) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onTouchStart?: (x: number, y: number) => void;
  onTouchEnd?: (x: number, y: number) => void;
}

export interface IframeGesturesOptions {
  /** 是否启用点击识别 */
  enableTap?: boolean;
  /** 是否启用滑动识别 */
  enableSwipe?: boolean;
  /** 点击时间阈值（ms） */
  tapTimeThreshold?: number;
  /** 点击移动阈值（px） */
  tapMoveThreshold?: number;
}

export function useIframeGestures(
  iframeDoc: Document,
  handlers: IframeGestureHandlers,
  options: IframeGesturesOptions = {},
) {
  const {
    enableTap = true,
    enableSwipe = true,
    tapTimeThreshold = 300,
    tapMoveThreshold = 10,
  } = options;

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let isListening = true;

  /**
   * 检查是否应该忽略该元素上的事件
   */
  function shouldIgnoreTarget(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) return false;

    const el = target as Element;
    // 忽略交互元素
    return !!(
      el.closest("button") ||
      el.closest("input") ||
      el.closest("textarea") ||
      el.closest("select") ||
      el.closest("a[href]") ||
      el.closest("[contenteditable]")
    );
  }

  /**
   * touchstart 处理
   */
  function handleTouchStart(e: TouchEvent) {
    if (!isListening || !enableTap) return;

    // 如果点击的是交互元素，不处理
    if (shouldIgnoreTarget(e.target)) return;

    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();

    handlers.onTouchStart?.(startX, startY);
  }

  /**
   * touchend 处理 - 核心手势识别逻辑
   */
  function handleTouchEnd(e: TouchEvent) {
    if (!isListening) return;

    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const deltaTime = Date.now() - startTime;

    handlers.onTouchEnd?.(endX, endY);

    // 判断是点击还是滑动
    const isTap =
      enableTap &&
      deltaTime < tapTimeThreshold &&
      Math.abs(deltaX) < tapMoveThreshold &&
      Math.abs(deltaY) < tapMoveThreshold;

    const isHorizontalSwipe =
      enableSwipe && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD;

    if (isTap) {
      // 点击事件
      handlers.onTap?.(endX, endY);
    } else if (isHorizontalSwipe) {
      // 水平滑动
      if (deltaX > 0) {
        handlers.onSwipeRight?.();
      } else {
        handlers.onSwipeLeft?.();
      }
    }
    // 垂直滑动不处理，让浏览器默认处理滚动
  }

  /**
   * 绑定事件监听器
   */
  function bind() {
    // 完全 passive，不阻塞主线程
    iframeDoc.addEventListener("touchstart", handleTouchStart, { passive: true });
    iframeDoc.addEventListener("touchend", handleTouchEnd, { passive: true });
  }

  /**
   * 解绑事件监听器
   */
  function unbind() {
    iframeDoc.removeEventListener("touchstart", handleTouchStart);
    iframeDoc.removeEventListener("touchend", handleTouchEnd);
  }

  /**
   * 暂停监听
   */
  function pause() {
    isListening = false;
  }

  /**
   * 恢复监听
   */
  function resume() {
    isListening = true;
  }

  // 自动绑定
  bind();

  return {
    bind,
    unbind,
    pause,
    resume,
  };
}
