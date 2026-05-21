"use client";

import { useRef, type ButtonHTMLAttributes, type TouchEvent } from "react";

// Mobile Safari fires `click` ~300ms after touchend AND sometimes fires
// neither (when the user drags a tiny bit). ReliableButton wires both
// touchend + click, dedupes via a recent-touch timestamp, and gates with a
// movement tolerance so a scroll-tap doesn't accidentally activate.
type ReliableButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  onPress: () => void;
};

const TAP_MOVE_TOLERANCE_PX = 12;

export function ReliableButton({
  onPress,
  disabled,
  onTouchStart,
  onTouchEnd,
  ...props
}: ReliableButtonProps) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastTouchPressRef = useRef(0);

  const handleTouchStart = (event: TouchEvent<HTMLButtonElement>) => {
    onTouchStart?.(event);
    const touch = event.changedTouches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLButtonElement>) => {
    onTouchEnd?.(event);
    if (event.defaultPrevented || disabled) return;

    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;

    const moved =
      Math.abs(touch.clientX - start.x) > TAP_MOVE_TOLERANCE_PX ||
      Math.abs(touch.clientY - start.y) > TAP_MOVE_TOLERANCE_PX;
    if (moved) return;

    lastTouchPressRef.current = Date.now();
    event.preventDefault();
    event.currentTarget.blur();
    onPress();
  };

  return (
    <button
      {...props}
      disabled={disabled}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={() => {
        // Suppress the synthetic click that follows a real touch tap.
        if (Date.now() - lastTouchPressRef.current < 700) return;
        onPress();
      }}
    />
  );
}
