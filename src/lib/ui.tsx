"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { startOfWeek, today, weekOwnerMonth } from "./dates";
import { snapshot, subscribe } from "./store";
import { EMPTY_STATE, type ISODate, type PlannerState } from "./types";

/** The app always opens in the column view (§5.5). */
export type View = "columns" | "list" | "archive" | "settings";

export type UiState = {
  view: View;
  /** §5.2 — the rail is a lens over the columns, not a column. */
  lensDeadlineId: string | null;
  selectedMonth: ISODate | null;
  selectedWeek: ISODate | null;
  selectedDay: ISODate | null;
  /** The task expanded in place, in whichever block it sits (no fifth column). */
  selectedTaskId: string | null;
  /** Desktop: the rail collapses (§5.2). */
  railCollapsed: boolean;
  /** Narrow: the rail is a drawer, closed until asked for (§5.4). */
  railDrawerOpen: boolean;
  backlogOpen: boolean;
  quickAddOpen: boolean;
  dayCloseOpen: boolean;
  /** `new` opens an empty deadline editor. */
  editingDeadlineId: string | null;
  /**
   * One short line, e.g. a blocked move against the per-day cap (§6.4). A
   * notice with `undo` is the answer to a row that vanished on a click: marking
   * done or dropping removes it from the columns at once, and this is the way
   * back. Such notices clear themselves after a few seconds.
   */
  notice: { text: string; settingsLink?: boolean; undo?: () => void } | null;
  /** The task that most recently moved, so it can animate once (§6.3). */
  lastMoved: string | null;
  listFilterDeadlineId: string | null;
  listFilterLevel: "all" | "none" | "month" | "week" | "day";
};

/** Today's month, week and day — the drill-down the app opens on. */
export function todaySelection(): Pick<UiState, "selectedMonth" | "selectedWeek" | "selectedDay"> {
  const day = today();
  const week = startOfWeek(day);
  return { selectedMonth: weekOwnerMonth(week), selectedWeek: week, selectedDay: day };
}

const INITIAL: UiState = {
  view: "columns",
  lensDeadlineId: null,
  // Nothing selected is the right state for a fresh render on the server, where
  // "today" is unknown. The client selects today as soon as it has loaded.
  selectedMonth: null,
  selectedWeek: null,
  selectedDay: null,
  selectedTaskId: null,
  railCollapsed: false,
  railDrawerOpen: false,
  backlogOpen: false,
  quickAddOpen: false,
  dayCloseOpen: false,
  editingDeadlineId: null,
  notice: null,
  lastMoved: null,
  listFilterDeadlineId: null,
  listFilterLevel: "all",
};

type UiContextValue = {
  ui: UiState;
  set: (patch: Partial<UiState>) => void;
  notify: (text: string, settingsLink?: boolean) => void;
  /** A notice with a way back, for an action that removed a row from view. */
  notifyUndo: (text: string, undo: () => void) => void;
  markMoved: (taskId: string) => void;
};

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [ui, setUi] = useState<UiState>(INITIAL);

  const set = useCallback((patch: Partial<UiState>) => {
    setUi((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearNotice = useRef<number | null>(null);

  const notify = useCallback((text: string, settingsLink = false) => {
    if (clearNotice.current !== null) window.clearTimeout(clearNotice.current);
    clearNotice.current = null;
    setUi((prev) => ({ ...prev, notice: { text, settingsLink } }));
  }, []);

  const notifyUndo = useCallback((text: string, undo: () => void) => {
    if (clearNotice.current !== null) window.clearTimeout(clearNotice.current);
    const notice = { text, undo };
    setUi((prev) => ({ ...prev, notice }));
    clearNotice.current = window.setTimeout(() => {
      clearNotice.current = null;
      setUi((prev) => (prev.notice === notice ? { ...prev, notice: null } : prev));
    }, 8000);
  }, []);

  // The landing animation plays once and then stops being state (§8.4).
  const clearMoved = useRef<number | null>(null);
  useEffect(() => () => {
    if (clearMoved.current !== null) window.clearTimeout(clearMoved.current);
    if (clearNotice.current !== null) window.clearTimeout(clearNotice.current);
  }, []);

  const markMoved = useCallback((taskId: string) => {
    setUi((prev) => ({ ...prev, lastMoved: taskId, notice: null }));
    if (clearMoved.current !== null) window.clearTimeout(clearMoved.current);
    clearMoved.current = window.setTimeout(() => {
      clearMoved.current = null;
      setUi((prev) => (prev.lastMoved === taskId ? { ...prev, lastMoved: null } : prev));
    }, 400);
  }, []);

  const value = useMemo(
    () => ({ ui, set, notify, notifyUndo, markMoved }),
    [ui, set, notify, notifyUndo, markMoved],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const value = useContext(UiContext);
  if (!value) throw new Error("useUi must be used inside UiProvider");
  return value;
}

/** Phase 1 state lives in localStorage, so the server snapshot is always empty. */
export function usePlanner(): PlannerState {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY_STATE);
}
