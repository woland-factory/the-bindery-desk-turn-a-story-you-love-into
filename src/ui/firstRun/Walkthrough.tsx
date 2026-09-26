import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { TOUR_STEPS } from "./steps";

// A non-modal coach mark. It points one short step at a time at a real control
// found by its `data-tour` name, positions a small card near it, and draws a
// light highlight ring. It is NOT modal: no blocking backdrop, no focus trap;
// the anchored control stays clickable and keyboard-focusable so the user
// completes the real action. On a narrow viewport the card docks to the bottom
// so positioning math never pushes it off-screen. If the target is not in the
// DOM yet, the card hides until it appears.

interface Props {
  /** 1-based step index into TOUR_STEPS. */
  step: number;
  onNext: () => void;
  onSkip: () => void;
}

const DOCK_MAX_WIDTH = 430;
const CARD_GAP = 10;

/** True when two measurements describe the same box (or both are absent). */
function sameRect(a: DOMRect | null, b: DOMRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

export function Walkthrough({ step, onNext, onSkip }: Props) {
  const current = TOUR_STEPS[step - 1];
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!current || typeof document === "undefined") return;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${current.anchor}"]`);
      const next = el ? el.getBoundingClientRect() : null;
      // Clear the ring the instant the target leaves the DOM so the coach-mark
      // never floats over a control that is gone (e.g. the book unloads to an
      // error). It re-anchors on its own when the control comes back. Skip the
      // state update when nothing moved so a live re-flow stays off this path.
      setRect((prev) => (sameRect(prev, next) ? prev : next));
    };
    measure();
    // A MutationObserver catches the target appearing or leaving; resize and
    // scroll catch it moving. Step change re-runs the whole effect.
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [current]);

  if (!current || rect === null) return null;

  const narrow = typeof window !== "undefined" && window.innerWidth <= DOCK_MAX_WIDTH;
  const showNext = step === 2;

  const ringStyle: CSSProperties = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };

  const cardStyle: CSSProperties = narrow
    ? {}
    : { top: rect.bottom + CARD_GAP, left: Math.max(CARD_GAP, rect.left) };

  return (
    <div className="walkthrough" aria-label="Guided first run">
      <div className="walkthrough__ring" style={ringStyle} aria-hidden="true" />
      <div className={`walkthrough__card${narrow ? " walkthrough__card--docked" : ""}`} style={cardStyle}>
        <p className="walkthrough__text" aria-live="polite">
          {current.text}
        </p>
        <div className="walkthrough__actions">
          <button type="button" className="btn btn--ghost walkthrough__skip" onClick={onSkip}>
            Skip
          </button>
          {showNext && (
            <button type="button" className="btn btn--primary walkthrough__next" onClick={onNext}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
