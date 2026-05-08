import { createContext, useContext } from 'react';

// Mirrors backend VerificationProgressPayload
export interface VerificationJob {
  jobId: string;
  type: 'CRIMINAL_VS_GUESTS' | 'GUEST_VS_CRIMINALS' | 'SWEEP';
  status: 'PROCESSING' | 'COMPLETE' | 'FAILED';
  sourceName: string;
  sourceId: string;
  checked: number;
  total: number;
  alertsFound: number;
  pct: number;
  durationMs?: number;
  updatedAt: number;
}

interface VerificationContextValue {
  activeJobs: Map<string, VerificationJob>;
}

export const VerificationContext = createContext<VerificationContextValue>({
  activeJobs: new Map(),
});

export function useVerificationContext() {
  return useContext(VerificationContext);
}
