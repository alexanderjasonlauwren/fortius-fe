// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ getPolicy: vi.fn(), scope: ["tenant-a", "branch-a"], signedIn: true }));
vi.mock("../api/intakePolicy", () => ({ getIntakePolicy: state.getPolicy }));
vi.mock("@/mocks/scope", () => ({ scopeKey: () => state.scope }));
vi.mock("@/features/auth/store/authStore", () => ({ useAuthStore: (selector: (store: { user: object | null }) => unknown) => selector({ user: state.signedIn ? {} : null }) }));
import { useIntakePolicy } from "./useIntakePolicy";
function Harness() { const policy = useIntakePolicy(); return <p>{policy.allowsManualIntake ? "manual-enabled" : "manual-disabled"}</p>; }
beforeEach(() => { state.scope = ["tenant-a", "branch-a"]; state.signedIn = true; state.getPolicy.mockReset(); });
afterEach(cleanup);
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><Harness /></QueryClientProvider>;
  return { ...render(tree()), tree };
}
describe("intake policy scope", () => {
  it("does not enable manual intake while loading or after failed policy reads", async () => {
    state.getPolicy.mockRejectedValue(new Error("network"));
    setup();
    expect(screen.getByText("manual-disabled")).toBeTruthy();
    await waitFor(() => expect(state.getPolicy).toHaveBeenCalledOnce());
    expect(screen.queryByText("manual-enabled")).toBeNull();
  });
  it("does not trust previous-scope manual policy while the new tenant loads", async () => {
    state.getPolicy.mockResolvedValue("manual");
    const view = setup();
    await screen.findByText("manual-enabled");
    state.scope = ["tenant-b", "branch-b"];
    state.getPolicy.mockResolvedValue("external_schedule");
    view.rerender(view.tree());
    expect(screen.getByText("manual-disabled")).toBeTruthy();
    await waitFor(() => expect(state.getPolicy).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("manual-enabled")).toBeNull();
  });
  it("does not fetch before authentication", () => {
    state.signedIn = false;
    setup();
    expect(state.getPolicy).not.toHaveBeenCalled();
    expect(screen.getByText("manual-disabled")).toBeTruthy();
  });
});
