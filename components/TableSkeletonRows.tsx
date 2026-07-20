interface TableSkeletonRowsProps {
  columns: number;
  rows?: number;
  label?: string;
}

export function TableSkeletonRows({
  columns,
  rows = 5,
  label = "Cargando información...",
}: TableSkeletonRowsProps) {
  return Array.from({ length: rows }, (_, rowIndex) => (
    <tr key={rowIndex} aria-hidden={rowIndex > 0 ? true : undefined}>
      {Array.from({ length: columns }, (_, columnIndex) => (
        <td key={columnIndex} className="px-6 py-4">
          <div
            className={`h-4 animate-pulse rounded bg-slate-200 ${
              columnIndex === 0 ? "w-36" : "w-20"
            }`}
          />
          {rowIndex === 0 && columnIndex === 0 && (
            <span className="sr-only" role="status">
              {label}
            </span>
          )}
        </td>
      ))}
    </tr>
  ));
}
