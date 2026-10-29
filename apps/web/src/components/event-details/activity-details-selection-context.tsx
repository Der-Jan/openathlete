import React, { createContext, useContext, useMemo, useState } from 'react';

import type { XAxisKind } from '../activity-analysis/stream-range';

type Domain = [number, number] | undefined;

type ActivityDetailsSelectionContextType = {
  /** The selected part, on the axis below; undefined: the whole activity */
  domain: Domain;
  setDomain: (d: Domain) => void;
  reset: () => void;
  fullDomain: [number, number];
  xAxis: XAxisKind;
  /** Switching axis drops the selection, whose bounds no longer apply */
  setXAxis: (kind: XAxisKind) => void;
};

const ActivityDetailsSelectionContext =
  createContext<ActivityDetailsSelectionContextType | null>(null);

type P = {
  fullDomain: [number, number];
  xAxis: XAxisKind;
  onXAxisChange: (kind: XAxisKind) => void;
  children: React.ReactNode;
};

export function ActivityDetailsSelectionProvider({
  fullDomain,
  xAxis,
  onXAxisChange,
  children,
}: P) {
  const [domain, setDomain] = useState<Domain>(undefined);

  const value = useMemo<ActivityDetailsSelectionContextType>(
    () => ({
      domain,
      setDomain,
      reset: () => setDomain(undefined),
      fullDomain,
      xAxis,
      setXAxis: (kind) => {
        setDomain(undefined);
        onXAxisChange(kind);
      },
    }),
    [domain, fullDomain, xAxis, onXAxisChange],
  );

  return (
    <ActivityDetailsSelectionContext.Provider value={value}>
      {children}
    </ActivityDetailsSelectionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useActivityDetailsSelection() {
  const ctx = useContext(ActivityDetailsSelectionContext);
  if (!ctx) {
    return {
      domain: undefined,
      setDomain: () => {},
      reset: () => {},
      fullDomain: undefined,
      xAxis: 'time' as XAxisKind,
      setXAxis: () => {},
    };
  }
  return ctx;
}
