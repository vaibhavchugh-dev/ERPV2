import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";

export interface DeleteIconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Accessible label; also the tooltip unless `title` is given. */
  label?: string;
  size?: "sm" | "md";
}

/** Standard trash-can button for deleting a row, line item, contact, attachment, etc. */
const DeleteIconButton: React.FC<DeleteIconButtonProps> = ({
  label = "Delete",
  title,
  size = "md",
  className,
  type = "button",
  ...rest
}) => {
  const classes = ["icon-btn-delete", size === "sm" ? "icon-btn-delete--sm" : "", className || ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} title={title ?? label} aria-label={label} {...rest}>
      <FontAwesomeIcon icon={faTrash} />
    </button>
  );
};

export default DeleteIconButton;
