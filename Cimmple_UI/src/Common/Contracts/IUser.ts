export interface IUser {
  firstName: string;
  lastName: string;
  email: string;
  message: string;
  isLocked: string;
  isManualLocked: string;
  lockDay: number;
  user_UniqueID: number;
  userName: string;
  tenantID: number;
  isMerge: string;
  currentUtcTime: any;
  mergeToken: string;
  isLaborModule: string;
  pwdChangeStatus: string;
  mergeURL: string;
  unmergeURL: string;
  rolId: string;
  roleName: string;
  showIncompleteSlideOut: boolean;
  isDuplicatePhone: boolean;
  isDuplicateEmail: boolean;
  primaryMethod: string;
}
