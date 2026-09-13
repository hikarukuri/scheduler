"use client";

/**
 * Dragging a task from one column onto a block — spec §6.3.
 *
 * No drag-and-drop library (§2). One pointer-event implementation serves mouse,
 * pen and touch: a mouse drag begins after 4px of movement, a touch drag after
 * a 220ms hold, so a finger can still scroll a column. Drop targets declare
 * themselves in the DOM with `data-drop-level`; hit testing is
 * `elementFromPoint`, so a target never has to be registered in React state.
 *
 * Dwelling over a month or week block selects it, which expands the next
 * column — that is how a task is carried from the backlog down to a day in one
 * gesture.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Placement } from "./placement";
import type { ISODate, PlacementLevel } from "./types";

export type DropSpec = { level: PlacementLevel; date: ISODate | null };

export function dropKey(level: PlacementLevel, date: ISODate | null): string {
  return `${level}:${date ?? ""}`;
}

/** Spread onto any element that should accept a dropped task. */
export function dropProps(level: PlacementLevel, date: ISODate | null, expands = false) {
  return {
    "data-drop-level": level,
    "data-drop-date": date ?? "",
    ...(expands ? { "data-drop-expands": "1" } : {}),
  } as const;
}

type DragContextValue = {
  draggingId: string | null;
  draggingTitle: string;
  overKey: string | null;
  start: (event: React.PointerEvent, taskId: string, title: string) => void;
  /** True just after a drag ended, so the trailing click does not also select. */
  recentlyDragged: () => boolean;
};

const DragContext = createContext<DragContextValue>({
  draggingId: null,
  draggingTitle: "",
  overKey: null,
  start: () => {},
  recentlyDragged: () => false,
});

export function useDrag() {
  return useContext(DragContext);
}

const EDGE_PX = 64;
const EDGE_SPEED = 14;
const TOUCH_HOLD_MS = 220;
const MOUSE_SLOP_PX = 4;
const TOUCH_SLOP_PX = 10;
const DWELL_MS = 450;

type Pending = {
  taskId: string;
  title: string;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  element: HTMLElement;
  holdTimer: number | null;
};

export function DragProvider({
  children,
  onDrop,
  onDwell,
}: {
  children: ReactNode;
  onDrop: (taskId: string, placement: Placement) => void;
  /** Called when a drag rests over an expandable block, to select it. */
  onDwell: (spec: DropSpec) => void;
}) {
  // The dragged task is held in state, not in the pending ref, because the
  // ghost that follows the pointer is rendered from it.
  const [dragged, setDragged] = useState<{ id: string; title: string } | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const pending = useRef<Pending | null>(null);
  const active = useRef(false);
  const ghost = useRef<HTMLDivElement | null>(null);
  const target = useRef<DropSpec | null>(null);
  const dwell = useRef<{ key: string; at: number; fired: boolean } | null>(null);
  const endedAt = useRef(0);
  const pointerAt = useRef({ x: 0, y: 0 });

  const onDropRef = useRef(onDrop);
  const onDwellRef = useRef(onDwell);
  useEffect(() => {
    onDropRef.current = onDrop;
    onDwellRef.current = onDwell;
  });

  const preventTouchScroll = useCallback((event: TouchEvent) => {
    event.preventDefault();
  }, []);

  const cleanup = useCallback(() => {
    const p = pending.current;
    if (p) {
      if (p.holdTimer !== null) window.clearTimeout(p.holdTimer);
      if (p.element.hasPointerCapture?.(p.pointerId)) {
        try {
          p.element.releasePointerCapture(p.pointerId);
        } catch {
          // The element may already be gone; nothing to release.
        }
      }
    }
    pending.current = null;
    active.current = false;
    target.current = null;
    dwell.current = null;
    document.body.classList.remove("dragging-active");
    window.removeEventListener("touchmove", preventTouchScroll);
    setDragged(null);
    setOverKey(null);
  }, [preventTouchScroll]);


  const begin = useCallback(() => {
    const p = pending.current;
    if (!p || active.current) return;
    active.current = true;
    document.body.classList.add("dragging-active");
    window.addEventListener("touchmove", preventTouchScroll, { passive: false });
    setDragged({ id: p.taskId, title: p.title });
  }, [preventTouchScroll]);

  const positionGhost = useCallback((x: number, y: number) => {
    const el = ghost.current;
    if (el) el.style.transform = `translate3d(${x + 12}px, ${y + 10}px, 0)`;
  }, []);


  const hitTest = useCallback((x: number, y: number) => {
    const under = document.elementFromPoint(x, y);
    const block = under?.closest<HTMLElement>("[data-drop-level]") ?? null;
    if (!block) {
      target.current = null;
      dwell.current = null;
      setOverKey(null);
      return;
    }
    const level = block.dataset.dropLevel as PlacementLevel;
    const date = block.dataset.dropDate || null;
    const key = dropKey(level, date);
    target.current = { level, date };
    setOverKey(key);

    if (!block.dataset.dropExpands) {
      dwell.current = null;
      return;
    }
    const now = Date.now();
    if (!dwell.current || dwell.current.key !== key) {
      dwell.current = { key, at: now, fired: false };
      return;
    }
    if (!dwell.current.fired && now - dwell.current.at > DWELL_MS) {
      dwell.current.fired = true;
      onDwellRef.current({ level, date });
    }
  }, []);

  /**
   * Carrying a task to a block that is off-screen — the common case on a phone,
   * where a column and a half is visible — means the strip and the column under
   * the pointer scroll themselves while the finger rests near an edge. The loop
   * lives and dies with the drag.
   */
  useEffect(() => {
    if (!dragged) return;
    let frame = 0;
    const step = () => {
      const { x, y } = pointerAt.current;
      const strip = document.querySelector<HTMLElement>(".column-strip");
      if (strip) {
        const box = strip.getBoundingClientRect();
        if (x < box.left + EDGE_PX) strip.scrollLeft -= EDGE_SPEED;
        else if (x > box.right - EDGE_PX) strip.scrollLeft += EDGE_SPEED;
      }
      const column = document.elementFromPoint(x, y)?.closest<HTMLElement>(".scroll-column");
      if (column) {
        const box = column.getBoundingClientRect();
        if (y < box.top + EDGE_PX) column.scrollTop -= EDGE_SPEED;
        else if (y > box.bottom - EDGE_PX) column.scrollTop += EDGE_SPEED;
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [dragged]);

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const p = pending.current;
      if (!p || event.pointerId !== p.pointerId) return;
      const dx = event.clientX - p.startX;
      const dy = event.clientY - p.startY;
      pointerAt.current = { x: event.clientX, y: event.clientY };

      if (!active.current) {
        const moved = Math.hypot(dx, dy);
        if (p.pointerType === "touch") {
          // Movement before the hold completes is a scroll, not a drag.
          if (moved > TOUCH_SLOP_PX) cleanup();
        } else if (moved > MOUSE_SLOP_PX) {
          begin();
        }
        if (!active.current) return;
      }
      positionGhost(event.clientX, event.clientY);
      hitTest(event.clientX, event.clientY);
    }

    function onUp(event: PointerEvent) {
      const p = pending.current;
      if (!p || event.pointerId !== p.pointerId) return;
      const wasActive = active.current;
      const spec = target.current;
      const taskId = p.taskId;
      cleanup();
      if (!wasActive) return;
      endedAt.current = Date.now();
      if (!spec) return;
      if (spec.level === "none") onDropRef.current(taskId, { level: "none" });
      else if (spec.date) onDropRef.current(taskId, { level: spec.level, date: spec.date });
    }

    function onCancel() {
      cleanup();
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && pending.current) cleanup();
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, [begin, cleanup, hitTest, positionGhost]);

  const start = useCallback(
    (event: React.PointerEvent, taskId: string, title: string) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (pending.current) cleanup();
      const element = event.currentTarget as HTMLElement;
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Capture is an optimisation; window listeners still see the events.
      }
      const p: Pending = {
        taskId,
        title,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        element,
        holdTimer: null,
      };
      pending.current = p;
      pointerAt.current = { x: event.clientX, y: event.clientY };
      positionGhost(event.clientX, event.clientY);
      if (event.pointerType === "touch") {
        p.holdTimer = window.setTimeout(() => {
          p.holdTimer = null;
          begin();
        }, TOUCH_HOLD_MS);
      }
    },
    [begin, cleanup, positionGhost],
  );

  const recentlyDragged = useCallback(() => Date.now() - endedAt.current < 250, []);

  const value = useMemo(
    () => ({
      draggingId: dragged?.id ?? null,
      draggingTitle: dragged?.title ?? "",
      overKey,
      start,
      recentlyDragged,
    }),
    [dragged, overKey, start, recentlyDragged],
  );

  return (
    <DragContext.Provider value={value}>
      {children}
      <div
        ref={ghost}
        className="drag-ghost"
        style={{ top: 0, left: 0, display: dragged ? "block" : "none" }}
        aria-hidden="true"
      >
        {dragged?.title ?? ""}
      </div>
    </DragContext.Provider>
  );
}
