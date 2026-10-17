import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Popover } from "radix-ui";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTROL, POPOVER } from "./controlStyles";
import { assignRef, commitNativeValue } from "./nativeControl";

interface Option {
  index: number;
  value: string;
  label: string;
  disabled: boolean;
  group?: string;
}

/** Above this many options the list gets a filter box; short lists use typeahead. */
const SEARCH_THRESHOLD = 8;

const matches = (option: Option, needle: string) =>
  !needle ||
  option.label.toLowerCase().includes(needle) ||
  !!option.group?.toLowerCase().includes(needle);

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

type OptionLikeProps = {
  value?: string | number | readonly string[];
  label?: string;
  disabled?: boolean;
  children?: ReactNode;
};

/** Reads the same <option>/<optgroup> children a native <select> would take. */
function collectOptions(children: ReactNode, group?: string): Omit<Option, "index">[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<OptionLikeProps>(child)) return [];
    if (child.type === Fragment) return collectOptions(child.props.children, group);
    if (child.type === "optgroup") {
      return child.props.disabled ? [] : collectOptions(child.props.children, child.props.label);
    }
    if (child.type !== "option") return [];
    const label = textOf(child.props.children);
    return [
      {
        value: child.props.value === undefined ? label : String(child.props.value),
        label,
        disabled: !!child.props.disabled,
        group,
      },
    ];
  });
}

type SelectInputProps = Omit<ComponentProps<"select">, "multiple"> & { invalid?: boolean };

/**
 * Drop-in for a native single <select>: same children, same `onChange(e)`.
 * Controlled use is the supported path (see DateInput for why).
 */
export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(
  (
    {
      className,
      invalid,
      children,
      value,
      defaultValue,
      onChange,
      disabled,
      id,
      "aria-label": ariaLabel,
      ...rest
    },
    ref,
  ) => {
    const selectRef = useRef<HTMLSelectElement | null>(null);
    const setSelectRef = useCallback(
      (element: HTMLSelectElement | null) => {
        selectRef.current = element;
        assignRef(ref, element);
      },
      [ref],
    );
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const typeahead = useRef({ text: "", at: 0 });
    const listId = useId();

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState<string | null>(null);
    const [uncontrolled, setUncontrolled] = useState(String(defaultValue ?? ""));

    const options: Option[] = collectOptions(children).map((option, index) => ({
      ...option,
      index,
    }));
    const current = value !== undefined ? String(value) : uncontrolled;
    const selected = options.find((option) => option.value === current);
    const searchable = options.length > SEARCH_THRESHOLD;

    const needle = query.trim().toLowerCase();
    const visible = options.filter((option) => matches(option, needle));
    const choosable = visible.filter((option) => !option.disabled);
    const activeOption = visible.find((option) => option.value === active);

    // Keep the active row in view inside the list only. scrollIntoView would
    // also scroll the page while the popover is still being positioned.
    useEffect(() => {
      const list = listRef.current;
      const row = list?.querySelector<HTMLElement>("[data-active]");
      if (!list || !row) return;
      if (row.offsetTop < list.scrollTop) {
        list.scrollTop = row.offsetTop - 4;
      } else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight + 4;
      }
    }, [active, open, query]);

    const handleOpenChange = (next: boolean) => {
      if (next) {
        setQuery("");
        setActive(
          selected && !selected.disabled
            ? selected.value
            : (options.find((option) => !option.disabled)?.value ?? null),
        );
      }
      setOpen(next);
    };

    const handleNativeChange = (event: ChangeEvent<HTMLSelectElement>) => {
      if (value === undefined) setUncontrolled(event.target.value);
      onChange?.(event);
    };

    const pick = (option: Option) => {
      if (option.disabled) return;
      commitNativeValue(selectRef.current, option.value);
      setOpen(false);
    };

    const onListKeyDown = (event: KeyboardEvent) => {
      const at = choosable.findIndex((option) => option.value === active);
      const last = choosable.length - 1;
      let next: Option | undefined;
      switch (event.key) {
        case "ArrowDown": next = choosable[Math.min(at + 1, last)]; break;
        case "ArrowUp": next = choosable[Math.max(at - 1, 0)]; break;
        case "PageDown": next = choosable[Math.min(at + 8, last)]; break;
        case "PageUp": next = choosable[Math.max(at - 8, 0)]; break;
        // In the filter box Home/End belong to the text caret.
        case "Home": if (!searchable) next = choosable[0]; break;
        case "End": if (!searchable) next = choosable[last]; break;
        case "Enter":
        case " ":
          if (event.key === " " && searchable) return;
          event.preventDefault();
          if (activeOption) pick(activeOption);
          return;
        default:
          if (!searchable && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const now = event.timeStamp;
            const buffer = typeahead.current;
            buffer.text = now - buffer.at > 600 ? event.key : buffer.text + event.key;
            buffer.at = now;
            const prefix = buffer.text.toLowerCase();
            next = choosable.find((option) => option.label.toLowerCase().startsWith(prefix));
          }
      }
      if (!next) return;
      event.preventDefault();
      setActive(next.value);
    };

    const optionId = (option: Option) => `${listId}-${option.index}`;

    // Consecutive options sharing an <optgroup> render under one heading.
    const sections: { group?: string; options: Option[] }[] = [];
    for (const option of visible) {
      const tail = sections[sections.length - 1];
      if (tail && tail.group === option.group) tail.options.push(option);
      else sections.push({ group: option.group, options: [option] });
    }

    const renderOption = (option: Option) => {
      const isActive = option.value === active;
      const isSelected = option.value === current;
      return (
        <div
          key={option.index}
          id={optionId(option)}
          role="option"
          aria-selected={isSelected}
          aria-disabled={option.disabled || undefined}
          data-active={isActive || undefined}
          onPointerMove={() => !option.disabled && !isActive && setActive(option.value)}
          onClick={() => pick(option)}
          className={cn(
            "flex cursor-pointer items-start gap-2 rounded-sm px-2.5 py-2 text-sm leading-snug transition-colors duration-100",
            isActive && "bg-panel-raised",
            isSelected ? "font-semibold text-ink" : option.value === "" ? "text-ink-muted" : "text-ink",
            option.disabled && "cursor-not-allowed opacity-45",
          )}
        >
          <span className="min-w-0 flex-1 break-words">{option.label}</span>
          <Check
            aria-hidden
            className={cn("mt-0.5 h-4 w-4 shrink-0 text-signal-ink", !isSelected && "invisible")}
          />
        </div>
      );
    };

    return (
      <div className="relative">
        <Popover.Root open={open} onOpenChange={handleOpenChange}>
          <Popover.Trigger asChild>
            {/* First in the wrapper so a surrounding <label> activates it. */}
            <button
              type="button"
              role="combobox"
              id={id}
              disabled={disabled}
              aria-label={ariaLabel}
              aria-haspopup="listbox"
              aria-invalid={invalid || undefined}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  handleOpenChange(true);
                }
              }}
              className={cn(
                CONTROL,
                "flex items-center gap-2 text-left",
                open && "border-signal",
                invalid && "border-rust focus:border-rust",
                className,
              )}
            >
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  (!selected || selected.value === "") && "text-ink-muted",
                )}
              >
                {selected?.label || "Pilih…"}
              </span>
              <ChevronDown
                aria-hidden
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-200 ease-desk",
                  open ? "rotate-180 text-signal-ink" : "text-ink-muted",
                )}
              />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={6}
              collisionPadding={12}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                (searchRef.current ?? listRef.current)?.focus({ preventScroll: true });
              }}
              onKeyDown={onListKeyDown}
              className={cn(
                POPOVER,
                "flex max-h-[min(22rem,var(--radix-popover-content-available-height))] min-w-[var(--radix-popover-trigger-width)] max-w-[min(28rem,calc(100vw_-_1.5rem))] flex-col overflow-hidden",
              )}
            >
              {searchable && (
                <div className="flex items-center gap-2 border-b border-line px-3">
                  <Search className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(event) => {
                      const nextNeedle = event.target.value.trim().toLowerCase();
                      setQuery(event.target.value);
                      setActive(
                        options.find((option) => !option.disabled && matches(option, nextNeedle))
                          ?.value ?? null,
                      );
                    }}
                    placeholder="Cari…"
                    aria-label="Cari pilihan"
                    aria-controls={listId}
                    aria-activedescendant={activeOption ? optionId(activeOption) : undefined}
                    autoComplete="off"
                    className="h-10 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:outline-none"
                  />
                </div>
              )}
              <div
                ref={listRef}
                id={listId}
                role="listbox"
                tabIndex={searchable ? -1 : 0}
                aria-label={ariaLabel}
                aria-activedescendant={
                  !searchable && activeOption ? optionId(activeOption) : undefined
                }
                className="relative min-h-0 flex-1 overflow-y-auto p-1 outline-none focus-visible:outline-none"
              >
                {visible.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-ink-muted">
                    Tidak ada pilihan yang cocok.
                  </p>
                ) : (
                  sections.map((section, i) =>
                    section.group ? (
                      <div key={i} role="group" aria-label={section.group}>
                        <div
                          aria-hidden
                          className="label px-2.5 pb-1 pt-2.5 text-2xs text-ink-muted"
                        >
                          {section.group}
                        </div>
                        {section.options.map(renderOption)}
                      </div>
                    ) : (
                      <Fragment key={i}>{section.options.map(renderOption)}</Fragment>
                    ),
                  )
                )}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <select
          ref={setSelectRef}
          {...rest}
          {...(value !== undefined ? { value } : { defaultValue })}
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          disabled={disabled}
          onChange={handleNativeChange}
        >
          {children}
        </select>
      </div>
    );
  },
);
SelectInput.displayName = "SelectInput";
