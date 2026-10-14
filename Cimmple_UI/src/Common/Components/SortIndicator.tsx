import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSort, faSortDown, faSortUp } from "@fortawesome/free-solid-svg-icons";

export type SortDirection = "asc" | "desc";

interface SortIndicatorProps {
  active: boolean;
  direction: SortDirection;
}

/** Fixed-width sort glyph so headers never change width when sort state changes. */
const SortIndicator: React.FC<SortIndicatorProps> = ({ active, direction }) => (
  <span className={`sort-indicator${active ? " is-active" : ""}`} aria-hidden="true">
    <FontAwesomeIcon icon={!active ? faSort : direction === "asc" ? faSortUp : faSortDown} />
  </span>
);

export default SortIndicator;
