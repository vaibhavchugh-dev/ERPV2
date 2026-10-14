import React from "react";
import SortIndicator, { SortDirection } from "./SortIndicator";

interface SortableThProps extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, "onClick"> {
  sortKey: string;
  activeKey: string | null;
  direction: SortDirection;
  onSort: (key: string) => void;
}

const SortableTh: React.FC<SortableThProps> = ({
  sortKey,
  activeKey,
  direction,
  onSort,
  className,
  style,
  children,
  ...rest
}) => {
  const active = activeKey === sortKey;
  const align = style?.textAlign;
  const justify = align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";
  return (
    <th
      {...rest}
      className={`sortable${className ? ` ${className}` : ""}`}
      style={style}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => onSort(sortKey)}
    >
      <span className="sortable-th-content" style={{ justifyContent: justify }}>
        <span>{children}</span>
        <SortIndicator active={active} direction={direction} />
      </span>
    </th>
  );
};

export default SortableTh;
