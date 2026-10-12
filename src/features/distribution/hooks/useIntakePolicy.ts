import { useQuery } from "@tanstack/react-query";
import { scopeKey } from "@/lib/scope";
import { useAuthStore } from "@/features/auth/store/authStore";
import { getIntakePolicy } from "../api/intakePolicy";
import { allowsManualIntake } from "../api/intakePolicy.contract";

export function useIntakePolicy() {
  const signedIn = useAuthStore((state) => !!state.user);
  const policy = useQuery({
    queryKey: [...scopeKey(), "intake-policy"],
    queryFn: getIntakePolicy,
    enabled: signedIn,
  });
  return { ...policy, allowsManualIntake: policy.isSuccess && allowsManualIntake(policy.data) };
}
