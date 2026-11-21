/**
 * Whether a run may still be sent off. Only a planned run leaves; a dispatched,
 * completed or cancelled one never does, and offering the button there (as the
 * plan page did on closed runs until Round 3) invites a click the service
 * refuses. No status at all is a build that can't say yet, so it still offers
 * it: the service's own guard is what refuses a second attempt.
 */
export function runCanBeDispatched(tripStatus: string | undefined): boolean {
  return tripStatus === undefined || tripStatus === "planned";
}
