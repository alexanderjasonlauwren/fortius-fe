import { pick } from "@/lib/dataSource";
import { sourcePlanReviewHttp } from "./sourcePlanReview.http";
import { sourcePlanReviewMock } from "./sourcePlanReview.mock";

export const getSourcePlanReview = pick(sourcePlanReviewMock, sourcePlanReviewHttp).getSourcePlanReview;
