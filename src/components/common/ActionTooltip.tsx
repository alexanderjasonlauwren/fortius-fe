import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Describes what a button does on hover and keyboard focus. An icon-only
 * button says nothing by itself, and the browser's `title` appears late,
 * unstyled, and never on focus.
 *
 * A disabled button receives no pointer events, so it is wrapped in a span
 * that can still be hovered -- the description matters most exactly when
 * the action is unavailable.
 */
export function ActionTooltip({
  label,
  disabled,
  side = "top",
  children,
}: {
  label: ReactNode;
  disabled?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? (
          <span tabIndex={0} className="inline-flex">
            {children}
          </span>
        ) : (
          children
        )}
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={4} className="max-w-64 text-left">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
