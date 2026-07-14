import { combineReducers } from "redux";

import RolePermissionReducer from "./RolePermissionReducer";
import PagePermissionReducer from "./PagePermissions";
import LocationReducer from "./LocationPermission";

const IndexReducer = combineReducers({
  RolePermissionReducer,
  PagePermissionReducer,
  LocationReducer
});

export default IndexReducer;







