import { AuthService } from "../Services/AuthService";

export type PagePermissionFlags = {
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPrint: boolean;
  canSend: boolean;
  canConvert: boolean;
  canDuplicate: boolean;
  can: (action: string) => boolean;
  /** Returns true if allowed; otherwise false (no toast — hide actions in UI instead). */
  ensure: (action: string) => boolean;
};

const ACTION_LABELS: Record<string, string> = {
  Add: "add",
  Edit: "edit",
  Delete: "delete",
  Print: "print",
  Send: "email / send",
  Convert: "convert",
  Duplicate: "duplicate",
  Approve: "approve",
  Pay: "pay",
  Void: "void",
  Receive: "receive",
  Ship: "ship",
  Invoice: "invoice",
  Export: "export",
  Import: "import",
  Post: "post",
  Manage: "manage",
  Compare: "compare",
  Complete: "complete",
  Sync: "sync",
  Upload: "upload",
  Download: "download",
  Reconcile: "reconcile",
  Close: "close",
  Reopen: "reopen",
  Reverse: "reverse",
  Schedule: "schedule",
  Seed: "seed",
  CreateJob: "create job orders",
  Issue: "issue stock",
  Reserve: "reserve stock",
  Transfer: "transfer stock",
  Adjust: "adjust stock",
  Assign: "assign",
  Acknowledge: "acknowledge",
};

export function permissionDeniedMessage(action: string): string {
  const label = ACTION_LABELS[action] || action.toLowerCase();
  return `You don't have permission to ${label} on this page. Contact an administrator if you need access.`;
}

/** Level-1 / Level-2 helpers for a module page path (e.g. `/quotations/customer`). */
export function usePagePermissions(pagePath: string | string[]): PagePermissionFlags {
  const paths = (Array.isArray(pagePath) ? pagePath : [pagePath]).filter(Boolean);
  const can = (action: string) =>
    paths.some((p) => AuthService.hasActionPermission(p, action));
  const ensure = (action: string) => can(action);

  return {
    canView: paths.some((p) => AuthService.hasPermissionForPath(p)),
    canAdd: can("Add"),
    canEdit: can("Edit"),
    canDelete: can("Delete"),
    canPrint: can("Print"),
    canSend: can("Send"),
    canConvert: can("Convert"),
    canDuplicate: can("Duplicate"),
    can,
    ensure,
  };
}
