import { logExport } from "../reports/activityLog";
import { useQueryClient } from "@tanstack/react-query";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { listQueryOf, setListQuery, type LiveListName } from "../live/liveLists";
import { isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
import { getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { statusLabel, statusPresentation } from "../domain/labels";
import { toCsv } from "../reports/csv";
import { StatusDot } from "./kit";
import { CommandButton } from "./CommandButton";
import { useSession } from "../auth/SessionContext";
import { tr, trn, trx } from "../i18n";

/** A cell drawn as `node` (a button, a link…) that still searches, sorts and exports as `text`. */
export type RichCell = { text: string; node: ReactNode };
export type TableCell = ReactNode | RichCell;

function isRich(cell: TableCell): cell is RichCell {
  return Boolean(cell) && typeof cell === "object" && !isValidElement(cell) && "node" in (cell as object) && "text" in (cell as object);
}

function textOf(cell: TableCell): string {
  if (isRich(cell)) return cell.text;
  if (typeof cell === "string" || typeof cell === "number") return statusLabel(String(cell));
  return "";
}

function renderCell(value: TableCell): ReactNode {
  if (isRich(value)) return value.node;
  if (typeof value !== "string" && typeof value !== "number") return value;
  const raw = String(value);
  const status = statusPresentation(raw);
  if (!status) return statusLabel(raw);
  return <StatusDot tone={status.tone}>{trx(status.label)}</StatusDot>;
}

type Row = {
  id: string;
  sourceIndex: number;
  cells: TableCell[];
  text: string[];
};

type DataTableProps = {
  head: string[];
  rows: TableCell[][];
  rowIds?: string[];
  className?: string;
  state?: "ready" | "loading" | "error";
  onRetry?: () => void;
  onRow?: (index: number) => void;
  /** Live builds: this box searches the server list instead (src/live/liveLists.ts); the demo searches its rows. */
  serverSearch?: LiveListName;
};

function stableRows(rows: TableCell[][], rowIds?: string[]): Row[] {
  const seen = new Map<string, number>();
  return rows.map((cells, sourceIndex) => {
    const text = cells.map((cell) => textOf(cell));
    const explicit = rowIds?.[sourceIndex]?.trim();
    const natural = text.filter(Boolean).join("\u001f");
    const base = explicit || natural || `row-${sourceIndex}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return {
      id: occurrence === 0 ? base : `${base}#${occurrence + 1}`,
      sourceIndex,
      cells,
      text,
    };
  });
}

export function DataTable({ head, rows, rowIds, className, state = "ready", onRetry, onRow, serverSearch }: DataTableProps) {
  const { agent } = useSession();
  const live = useLiveSessionMaybe();
  const queryClient = useQueryClient();
  const server = live && serverSearch ? serverSearch : null;
  const [query, setQuery] = useState("");
  // A new page starts without a server search; then the box asks the server 400 ms after the last key (Enter: at once).
  useEffect(() => {
    if (server) setListQuery(server, { q: "", pages: 1 });
  }, [server]);
  useEffect(() => {
    if (!server) return;
    const timer = window.setTimeout(() => searchServer(query), 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchServer only reads server and query
  }, [query, server]);
  function searchServer(text: string) {
    if (!server || listQueryOf(server).q === text.trim()) return;
    setListQuery(server, { q: text.trim(), pages: 1 });
    void queryClient.invalidateQueries({ queryKey: ["records"] });
  }
  const [chips, setChips] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [menu, setMenu] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  const data = useMemo<Row[]>(() => {
    const needles = [server ? "" : query.trim().toLowerCase(), ...chips.map((chip) => chip.toLowerCase())].filter(Boolean);
    return stableRows(rows, rowIds)
      .filter((row) => needles.every((needle) => row.text.some((cell) => cell.toLowerCase().includes(needle))));
  }, [chips, query, rowIds, rows, server]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => head.map((column, index) => ({ id: column, header: column, accessorFn: (row) => row.text[index] ?? "" })),
    [head],
  );

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.id,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sorted = table.getRowModel().rows;
  const pageCount = Math.max(1, Math.ceil(sorted.length / 25));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * 25, safePage * 25 + 25);
  const csv = toCsv([head, ...data.map((row) => row.text)]);

  if (state === "loading") return <p className="state-line">{tr("Loading.")}</p>;
  if (state === "error") {
    return (
      <p className="state-line">{trn("Could not load. {0}", <CommandButton command="admin.table.retry" className="link-action" type="button" onDone={onRetry}>{tr("Retry")}</CommandButton>)}</p>
    );
  }

  return (
    <div className="table-wrap">
      <div className="actions">
        <input
          className="table-search"
          value={query}
          placeholder={tr("Search")}
          aria-label={tr("Search this table")}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") searchServer(query);
          }}
        />
        <CommandButton command="admin.table.filter" className="secondary-btn" type="button" onDone={() => { if (query.trim()) { setChips((current) => [...current, query.trim()]); setQuery(""); } }}>{tr("Add filter")}</CommandButton>
        <a className="secondary-btn" href={`data:text/csv,${encodeURIComponent(csv)}`} download="movera.csv" onClick={() => logExport(agent?.id, "Table (CSV)")}>{tr("Export CSV")}</a>
      </div>
      <div className="actions">
        {chips.map((chip) => (
          <CommandButton command="admin.table.clearFilter" key={chip} className="secondary-btn" type="button" onDone={() => setChips((current) => current.filter((item) => item !== chip))}>{chip} ×</CommandButton>
        ))}
      </div>
      {visible.length === 0 ? <p className="state-line">{tr("Nothing to show.")}</p> : (
        <table className={className}>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id}>
                    <CommandButton command="admin.table.sort" className="link-action" type="button" onDone={() => header.column.getToggleSortingHandler()?.(new MouseEvent("click") as never)}>{String(header.column.columnDef.header)}</CommandButton>
                  </th>
                ))}
                <th>{tr("Row")}</th>
              </tr>
            ))}
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} onClick={() => onRow?.(row.original.sourceIndex)}>
                {row.original.cells.map((cell, index) => (
                  <td key={`${row.id}-${index}`}>{renderCell(cell)}</td>
                ))}
                <td>
                  <CommandButton command="admin.table.menu" className="link-action" type="button" onDone={() => setMenu(menu === row.id ? null : row.id)}>{tr("Menu")}</CommandButton>
                  {menu === row.id ? (
                    <CommandButton command="admin.table.open" className="link-action" type="button" onDone={() => onRow?.(row.original.sourceIndex)}>{tr("Open")}</CommandButton>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="state-line">{trn(sorted.length === 1 ? "{0} row · page {1} of {2}{3}{4}" : "{0} rows · page {1} of {2}{3}{4}", sorted.length, safePage + 1, pageCount, <CommandButton command="admin.table.previous" className="link-action" type="button" disabled={safePage === 0} onDone={() => setPage(safePage - 1)}>{tr("Previous")}</CommandButton>, <CommandButton command="admin.table.next" className="link-action" type="button" disabled={safePage >= pageCount - 1} onDone={() => setPage(safePage + 1)}>{tr("Next")}</CommandButton>)}</p>
    </div>
  );
}
