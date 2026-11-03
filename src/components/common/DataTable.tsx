import { useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Panel";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render: (row: T, index: number) => ReactNode;
  /** Supplying this makes the column sortable. */
  sortValue?: (row: T) => string | number;
  /** Fixed width, e.g. "12rem" or "1%" for shrink-to-fit action columns. */
  width?: string;
  className?: string;
  headerClassName?: string;
}

/**
 * One page of a server-paged list. The table renders `data` as that page and
 * asks for another through `onPageChange`; it never slices or re-sorts, since
 * sorting one page in the browser would present a partial order as the whole.
 */
export interface ServerPaging {
  /** 1-based, as the API counts. */
  page: number;
  hasNext: boolean;
  /** Absent when the server did not count; a floor when `totalIsFloor`. */
  totalItems?: number;
  totalIsFloor?: boolean;
  pageSize: number;
  onPageChange: (page: number) => void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  emptyAction?: ReactNode;
  className?: string;
  /** Stable key per row. Falls back to index. */
  rowKey?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  /** Tailwind text-colour class driving the row's docket spine. */
  spineFor?: (row: T) => string | undefined;
  /** Rows per page. Omit for no pagination. */
  pageSize?: number;
  /** Server-paged instead: `data` is one page of a longer list. */
  server?: ServerPaging;
  /** Column key to sort by on first render. */
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
  dense?: boolean;
  /** Renders under the last row, e.g. a totals line. */
  footer?: ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  emptyMessage = "Belum ada data",
  emptyDescription,
  emptyIcon,
  emptyAction,
  className,
  rowKey,
  onRowClick,
  spineFor,
  pageSize,
  server,
  defaultSortKey,
  defaultSortDir = "asc",
  dense = false,
  footer,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);
  const [page, setPage] = useState(0);

  const alignClass = {
    left: "text-left",
    right: "text-right",
    center: "text-center",
  } as const;

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (server || !col?.sortValue) return data;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "id") * dir;
    });
  }, [columns, data, sortKey, sortDir, server]);

  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const visible = pageSize && !server
    ? sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)
    : sorted;
  const sortable = (col: Column<T>) => !server && Boolean(col.sortValue);

  function toggleSort(col: Column<T>) {
    if (!sortable(col)) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
    setPage(0);
  }

  const cellPad = dense ? "px-4 py-2" : "px-5 py-3.5";

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-panel-sunk">
              {columns.map((col) => {
                const active = sortKey === col.key;
                const SortIcon = !active ? ChevronsUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    aria-sort={
                      !sortable(col)
                        ? undefined
                        : active
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                    }
                    className={cn(
                      "label text-2xs text-ink-muted",
                      cellPad,
                      "py-2.5",
                      alignClass[col.align ?? "left"],
                      col.headerClassName,
                    )}
                  >
                    {sortable(col) ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        className={cn(
                          "group inline-flex items-center gap-1.5 transition-colors hover:text-ink",
                          active && "text-ink",
                          col.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {col.header}
                        <SortIcon
                          className={cn(
                            "h-3 w-3 transition-opacity",
                            active ? "opacity-100" : "opacity-0 group-hover:opacity-60",
                          )}
                        />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              Array.from({ length: Math.min(server?.pageSize ?? pageSize ?? 6, 6) }).map((_, r) => (
                <tr key={r} className="border-b border-line">
                  {columns.map((col) => (
                    <td key={col.key} className={cellPad}>
                      <Skeleton
                        className={cn("h-3.5", r % 2 ? "w-2/3" : "w-4/5")}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState
                    icon={emptyIcon}
                    title={emptyMessage}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                </td>
              </tr>
            ) : (
              visible.map((row, idx) => {
                const spine = spineFor?.(row);
                return (
                  <tr
                    key={rowKey?.(row, idx) ?? idx}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      "border-b border-line transition-colors last:border-b-0",
                      onRowClick && "cursor-pointer",
                      "hover:bg-panel-sunk",
                    )}
                  >
                    {columns.map((col, colIdx) => (
                      <td
                        key={col.key}
                        className={cn(
                          "text-sm text-ink",
                          cellPad,
                          alignClass[col.align ?? "left"],
                          colIdx === 0 && spine && "relative",
                          col.className,
                        )}
                      >
                        {/* The docket spine lives inside the first cell, not on
                            the row: a ::before on a <tr> is laid out as an extra
                            table cell and shifts every column along. */}
                        {colIdx === 0 && spine && (
                          <span
                            className={cn("absolute inset-y-0 left-0 w-[3px] bg-current", spine)}
                            aria-hidden
                          />
                        )}
                        {col.render(row, idx)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>

          {footer && !isLoading && visible.length > 0 && (
            <tfoot className="border-t-2 border-ink">{footer}</tfoot>
          )}
        </table>
      </div>

      {server && !isLoading && (server.page > 1 || server.hasNext) && (
        <ServerPager paging={server} shown={visible.length} />
      )}

      {pageSize && !server && !isLoading && sorted.length > pageSize && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-2.5">
          <p className="text-xs text-ink-muted">
            <span className="data">{safePage * pageSize + 1}</span>–
            <span className="data">
              {Math.min(sorted.length, (safePage + 1) * pageSize)}
            </span>{" "}
            dari <span className="data">{sorted.length}</span> baris
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="Halaman sebelumnya"
              className="rounded-sm border border-line-strong p-1 text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="data px-2 text-xs text-ink-muted">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              aria-label="Halaman berikutnya"
              className="rounded-sm border border-line-strong p-1 text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const pagerButton =
  "rounded-sm border border-line-strong p-1 text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-40";

function ServerPager({ paging, shown }: { paging: ServerPaging; shown: number }) {
  const first = (paging.page - 1) * paging.pageSize + 1;
  const last = first + shown - 1;
  const total =
    paging.totalItems === undefined
      ? null
      : `${paging.totalItems.toLocaleString("id-ID")}${paging.totalIsFloor ? "+" : ""}`;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-2.5">
      <p className="text-xs text-ink-muted">
        <span className="data">{first}</span>–<span className="data">{last}</span>
        {total && (
          <>
            {" "}dari <span className="data">{total}</span>
          </>
        )}{" "}
        baris
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => paging.onPageChange(paging.page - 1)}
          disabled={paging.page <= 1}
          aria-label="Halaman sebelumnya"
          className={pagerButton}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="data px-2 text-xs text-ink-muted">Hal. {paging.page}</span>
        <button
          type="button"
          onClick={() => paging.onPageChange(paging.page + 1)}
          disabled={!paging.hasNext}
          aria-label="Halaman berikutnya"
          className={pagerButton}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
