import React from "react";
import { ColumnDefinition } from "../Hooks/useColumnChooser";

interface ColumnChooserProps {
  columns: ColumnDefinition[];
  hiddenColumns: string[];
  showMenu: boolean;
  onToggleMenu: () => void;
  onToggleColumn: (key: string) => void;
  containerRef: React.Ref<HTMLDivElement>;
}

/** Columns show/hide dropdown — place in `.page-actions` before the primary Add button. */
const ColumnChooser: React.FC<ColumnChooserProps> = ({
  columns,
  hiddenColumns,
  showMenu,
  onToggleMenu,
  onToggleColumn,
  containerRef,
}) => {
  return (
    <div className="column-chooser" ref={containerRef}>
      <button className="btn-secondary" onClick={onToggleMenu} type="button">
        <span>Columns</span>
      </button>
      {showMenu && (
        <div className="column-chooser-menu">
          {columns.map((column) => (
            <label className="column-chooser-option" key={column.key}>
              <input
                type="checkbox"
                checked={column.locked || !hiddenColumns.includes(column.key)}
                disabled={column.locked}
                onChange={() => onToggleColumn(column.key)}
              />
              <span>{column.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

export default ColumnChooser;
