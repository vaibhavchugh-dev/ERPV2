/**
 * Starts downloading the signed-in layout and the Dashboard chunks together. Without this the
 * browser fetches them one after the other (layout first, then the page it renders).
 * Webpack reuses these requests for the matching React.lazy imports.
 */
let started = false;

export const preloadShell = () => {
  if (started) return;
  started = true;
  void import("./Components/ProtectedLayout");
  void import("../Modules/Dashboard/Dashboard");
};
