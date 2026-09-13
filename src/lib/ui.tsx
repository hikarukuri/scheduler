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
  /** One short line, e.g. a blocked move against the per-day cap (§6.4). */
  notice: { text: string; settingsLink?: boolean } | null;
  /** The task that most recently moved, so it can animate once (§6.3). */
  lastMoved: string | null;
  listFilterDeadlineId: string | null;
  listFilterLevel: "all" | "none" | "month" | "week" | "day";
};

const INITIAL: UiState = {
  view: "columns",
  lensDeadlineId: null,
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
  markMoved: (taskId: string) => void;
};

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [ui, setUi] = useState<UiState>(INITIAL);

  const set = useCallback((patch: Partial<UiState>) => {
    setUi((prev) => ({ ...prev, ...patch }));
  }, []);

  const notify = useCallback((text: string, settingsLink = false) => {
    setUi((prev) => ({ ...prev, notice: { text, settingsLink } }));
  }, []);

  // The landing animation plays once and then stops being state (§8.4).
  const clearMoved = useRef<number | null>(null);
  useEffect(() => () => {
    if (clearMoved.current !== null) window.clearTimeout(clearMoved.current);
  }, []);

  const markMoved = useCallback((taskId: string) => {
    setUi((prev) => ({ ...prev, lastMoved: taskId, notice: null }));
    if (clearMoved.current !== null) window.clearTimeout(clearMoved.current);
    clearMoved.current = window.setTimeout(() => {
      clearMoved.current = null;
      setUi((prev) => (prev.lastMoved === taskId ? { ...prev, lastMoved: null } : prev));
    }, 400);
  }, []);

  const value = useMemo(() => ({ ui, set, notify, markMoved }), [ui, set, notify, markMoved]);
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
