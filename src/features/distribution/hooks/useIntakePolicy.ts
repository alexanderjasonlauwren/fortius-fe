import { useQuery } from "@tanstack/react-query";
import { scopeKey } from "@/lib/scope";
import { SHELL } from "@/hooks/useDeskMutation";
import { useAuthStore } from "@/features/auth/store/authStore";
import { getIntakePolicy } from "../api/intakePolicy";
import { allowsManualIntake } from "../api/intakePolicy.contract";

export function useIntakePolicy() {
  const signedIn = useAuthStore((state) => !!state.user);
  const policy = useQuery({
    queryKey: [...scopeKey(), "intake-policy"],
    queryFn: getIntakePolicy,
    enabled: signedIn,
    // The agent's intake mode changes in Pengaturan, not between pages.
    staleTime: 5 * 60_000,
    meta: SHELL,
  });
  return { ...policy, allowsManualIntake: policy.isSuccess && allowsManualIntake(policy.data) };
}
