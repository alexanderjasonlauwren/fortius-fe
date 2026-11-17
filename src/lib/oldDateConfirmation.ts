import { create } from "zustand";

interface PendingConfirmation {
  message: string;
  resolve: (confirmed: boolean) => void;
}

/** The one open question, if any; OldDateConfirmHost renders it. */
export const useOldDateConfirmation = create<{ pending: PendingConfirmation | null }>(() => ({ pending: null }));

/**
 * Asks whether a date more than 31 days back is meant (Round 1 G24: a 2020
 * receipt posted without anyone noticing the year). Resolves true when the
 * person confirms it.
 */
export function askOldDate(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    useOldDateConfirmation.setState({ pending: { message, resolve } });
  });
}

/** Settles the open question. */
export function answerOldDate(confirmed: boolean): void {
  useOldDateConfirmation.getState().pending?.resolve(confirmed);
  useOldDateConfirmation.setState({ pending: null });
}
