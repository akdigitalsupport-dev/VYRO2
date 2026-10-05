export type TableColumn<T> = { label: string; render: (row: T) => React.ReactNode; className?: string };

export function ServerTable<T extends { id: string }>({ rows, columns, emptyTitle, emptyMessage }: {
  rows: T[];
  columns: TableColumn<T>[];
  emptyTitle: string;
  emptyMessage: string;
}) {
  if (rows.length === 0) return <div className="empty-state"><span className="empty-icon" aria-hidden="true">↗</span><strong>{emptyTitle}</strong><p>{emptyMessage}</p></div>;
  return <div className="table-wrap"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column.label}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td className={column.className} key={column.label}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>;
}
