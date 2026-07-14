const initialState = {
  permissions: {} as any
};

const PagePermissionReducer = (state = initialState, action: any) => {
  switch (action.type) {
    case "SET_PERMISSION":
      const permissions = action.payload;
      const permissionState = {} as any;

      permissions.forEach((section: any) => {
        if (section.subitems && section.subitems.length > 0) {
          section.subitems.forEach((subitem: any) => {
            permissionState[subitem.title] = subitem.permisssions;
          });
        }
      });

      return {
        ...state,
        permissions: permissionState,
      };
    case "SET_PAGE_PERMISSIONS":
      return {
        ...state,
        permissions: action.payload
      };
    default:
      return state;
  }
};

export default PagePermissionReducer;
