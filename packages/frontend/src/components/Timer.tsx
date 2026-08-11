import { useEffect, useRef, useState } from "react";

interface TimerProps {
  /** Total seconds allowed. */
  totalSeconds: number;
  /** Called once when the timer reaches zero. */
  onExpired: () => void;
  /** Whether the timer should be running. */
  running: boolean;
}

/**
 * Countdown timer for test mode. Displays minutes:seconds in IBM Plex Mono.
 * Calls onExpired once when time runs out.
 */
export function Timer({
  totalSeconds,
  onExpired,
  running,
}: TimerProps): React.ReactElement {
  const [remaining, setRemaining] = useState(totalSeconds);
  const expiredRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      startTimeRef.current = null;
      return;
    }

    // Use real elapsed time for accuracy (not setInterval drift).
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }

    const tick = () => {
      const elapsed = Math.floor(
        (Date.now() - (startTimeRef.current ?? Date.now())) / 1000,
      );
      const left = Math.max(0, totalSeconds - elapsed);
      setRemaining(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpired();
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [totalSeconds, onExpired, running]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const isLow = remaining < 60;

  return (
    <span
      className="font-mono text-lg font-medium tabular-nums"
      style={{
        color: isLow ? "var(--color-error)" : "var(--color-ink)",
        fontFamily: "'IBM Plex Mono', monospace",
      }}
      aria-live="polite"
      aria-label={`${minutes} minutes ${seconds} seconds remaining`}
    >
      {formatted}
    </span>
  );
}
