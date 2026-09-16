import { combineReducers } from "redux";

import PagePermissionReducer from "./PagePermissions";
import LocationReducer from "./LocationPermission";

const IndexReducer = combineReducers({
  PagePermissionReducer,
  LocationReducer
});

export default IndexReducer;
