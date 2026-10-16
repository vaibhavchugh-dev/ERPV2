/** Client-side mirror of the API's AccountProtection rules; the server remains the authority. */

export const isAdminRoleName = (roleName?: string | null): boolean => /admin/i.test(roleName || "");

export const getCurrentUserId = (): number => {
  try {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    return Number(storage?.userId || storage?.user_UniqueID || 0) || 0;
  } catch {
    return 0;
  }
};

/** Reason the account must stay Active, or "" when it can be deactivated. */
export const getKeepActiveReason = (roleName: string | null | undefined, targetUserId: number): string => {
  if (targetUserId > 0 && targetUserId === getCurrentUserId()) {
    return "You cannot deactivate your own account.";
  }
  if (isAdminRoleName(roleName)) {
    return "Admin accounts cannot be set to Inactive. Change the role first.";
  }
  return "";
};

/** Non-admins cannot change roles / login / admin targets — match API messaging. */
export const getNonAdminSecurityHint = (): string =>
  "Only an administrator can change login access, passwords, Admin roles, or Admin accounts.";
