import { pick } from "@/lib/dataSource";
import { intakePolicyHttp } from "./intakePolicy.http";
import { intakePolicyMock } from "./intakePolicy.mock";

export const getIntakePolicy = pick(intakePolicyMock, intakePolicyHttp).getIntakePolicy;
