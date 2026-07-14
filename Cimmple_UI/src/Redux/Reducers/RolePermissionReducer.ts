// Global State for Menu Role Permission
const initialState = {
  permissionViewSchedule: false,
  permissionViewLaborTips: false,
  permissionViewForecast: false,
  permissionLaborSmileID: false,
  permissionSettingEnterPriseWise: false,
  permissionPayrollProcessor: false,
  permissionMyReports: false,
  permissionTimeOffRequest: false,
  permissionPtoSetting: false,
  permissionTimesheet: false,
  permissionPerformance: false,
  permissionRole: false,
  permissionTimeClock: false,
  permissionHoliday: false,
  permissionApprove: false,
  permissionLaborDashboard: false,
  permissionHousekeeping: false,
  permissionUserManagement: false,
  permissionInvoiceInbox: false,
  permissionEntityManagement: false,
  permissionJournalEntry: false,
  permissionPayrollImport: false,
  permissionMakePayments: false,
  permissionVendor: false,
  permissionAlertPreferences: false,
  permissionInvAppSetting: false,
  permissionInvApp: false,
  permissionBankSync: false,
  permissionImportUser: false,
  permissionePayOnboarding: false
};

const RolePermissionReducer = (state = initialState, action: any) => {
  if (sessionStorage.getItem("headPermission")) {
    const headPermission = JSON.parse(
      sessionStorage.getItem("headPermission")!
    );
    let actions: any = {};
    actions.payload = headPermission;
    state = updateRolePermission(state, actions);
  } else if (localStorage.getItem("headPermission")) {
    const headPermission = JSON.parse(localStorage.getItem("headPermission")!);
    let actions: any = {};
    actions.payload = headPermission;
    state = updateRolePermission(state, actions);
  }

  switch (action.type) {
    case "UPDATE_ROLE_PERMISSION":
      return updateRolePermission(initialState, action);
    case "SET_ROLE_PERMISSIONS":
      return {
        ...state,
        rolePermissions: action.payload
      };
    default:
      return state;
  }
};

export default RolePermissionReducer;

const updateRolePermission = (initailState: any, actions: any) => {
  let newState = { ...initailState };
  let newRolePermission = actions.payload;
  let storage = JSON.parse(localStorage.getItem("storage") || "{}");
  
  for (let i = 0; i < newRolePermission.length; i++) {
    if (newRolePermission[i].permissionID === 10006) {
      newState.permissionViewSchedule = true;
    } else if (newRolePermission[i].permissionID === 10009) {
      newState.permissionViewLaborTips = true;
    } else if (newRolePermission[i].permissionID === 10005) {
      newState.permissionViewForecast = true;
    } else if (newRolePermission[i].permissionID === 10004) {
      newState.permissionLaborSmileID = true;
    } else if (newRolePermission[i].permissionID === 10030) {
      newState.permissionSettingEnterPriseWise = true;
    } else if (newRolePermission[i].permissionID === 10034) {
      newState.permissionPayrollProcessor = true;
    } else if (newRolePermission[i].permissionID === 10012) {
      newState.permissionMyReports = true;
    } else if (newRolePermission[i].permissionID === 10008) {
      newState.permissionTimeOffRequest = true;
    } else if (newRolePermission[i].permissionID === 10032) {
      newState.permissionPtoSetting = true;
    } else if (newRolePermission[i].permissionID === 10003) {
      newState.permissionTimesheet = true;
    } else if (newRolePermission[i].permissionID === 10002) {
      newState.permissionPerformance = true;
    } else if (newRolePermission[i].permissionID === 2235) {
      newState.permissionRole = true;
    } else if (newRolePermission[i].permissionID === 10035) {
      newState.permissionTimeClock = true;
    } else if (newRolePermission[i].permissionID === 10033) {
      newState.permissionHoliday = true;
    } else if (newRolePermission[i].permissionID === 10007) {
      newState.permissionHousekeeping = true;
    } else if (newRolePermission[i].permissionID === 2084) {
      newState.permissionPayrollImport = true;
    } else if (newRolePermission[i].permissionName === 'Invoice Entry') {
      newState.permissionInvoiceInbox = true;
    } else if (
      newRolePermission[i].moduleName === "LaborManagement" &&
      newRolePermission[i].permissionName === "Unapprove"
    ) {
      newState.permissionApprove = true;
    } else if (
      newRolePermission[i].permissionName === "Labor Performance" &&
      newRolePermission[i].moduleName === "Dashboard"
    ) {
      newState.permissionLaborDashboard = true;
    } else if (
      newRolePermission[i].permissionName === "User Management" &&
      newRolePermission[i].moduleName === "All"
    ) {
      newState.permissionUserManagement = true;
    } else if (newRolePermission[i].permissionID === 56) {
      newState.permissionEntityManagement = true;
    } else if (newRolePermission[i].permissionID === 148 && newRolePermission[i].moduleName === "Accounting") {
      newState.permissionJournalEntry = true;
    } else if (
      (newRolePermission[i].permissionName === "View Payments" || newRolePermission[i].permissionName === "Make Payments") &&
      newRolePermission[i].moduleName === "Accounting"
    ) {
      newState.permissionMakePayments = true;
    } else if (
      newRolePermission[i].permissionName === "Vendors" &&
      newRolePermission[i].moduleName === "Accounting"
    ) {
      newState.permissionVendor = true;
    } else if (
      newRolePermission[i].permissionName === "Invoice Approvals Settings" &&
      newRolePermission[i].moduleName === "Accounting"
    ) {
      newState.permissionInvAppSetting = true;
    } else if (
      newRolePermission[i].permissionName === "Approve Invoices" &&
      newRolePermission[i].moduleName === "Accounting"
    ) {
      newState.permissionInvApp = true;
    } else if (newRolePermission[i].permissionID === 2063 || 
      newRolePermission[i].permissionID === 2086 ||
      newRolePermission[i].permissionID === 2104 ||
      newRolePermission[i].permissionID === 2348) {
      newState.permissionBankSync = true;
    } else if (storage?.userName === "Admin.230") {
      newState.permissionImportUser = true;
      newState.permissionePayOnboarding = true;
    }
    
    newState.permissionAlertPreferences = true;
  }
  return newState;
};
