import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

export const LOCATION_CHANGED_EVENT = "locationChanged";

/**
 * Persist the working location and notify React listeners (via Redux sync).
 * Use from non-hook call sites (e.g. System Settings). Prefer setLocationId in components.
 */
export function notifyLocationChanged(locationId: number) {
  if (!locationId || locationId <= 0) return;
  localStorage.setItem("locationId", String(locationId));
  window.dispatchEvent(
    new CustomEvent(LOCATION_CHANGED_EVENT, {
      detail: { locationId },
    })
  );
}

/**
 * Active working location from Redux (seeded from localStorage).
 * Layout keys page content on locationId so lists remount/refetch on switch.
 */
export function useActiveLocation() {
  const dispatch = useDispatch();
  const locationId = useSelector(
    (state: any) => Number(state.LocationReducer?.locationId) || 0
  );

  const setLocationId = useCallback(
    (nextId: number) => {
      if (!nextId || nextId <= 0) return;
      if (nextId === locationId) return;
      // Reducer persists to localStorage; Layout remounts from this state change.
      dispatch({ type: "SET_LOCATION", payload: nextId });
    },
    [dispatch, locationId]
  );

  // Login/persistSession writes localStorage before Redux updates; hydrate if store is stale.
  useEffect(() => {
    if (locationId > 0) return;
    const stored = Number(localStorage.getItem("locationId") || 0);
    if (stored > 0) {
      dispatch({ type: "SET_LOCATION", payload: stored });
    }
  }, [dispatch, locationId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const newId = Number((event as CustomEvent).detail?.locationId) || 0;
      if (newId > 0 && newId !== locationId) {
        dispatch({ type: "SET_LOCATION", payload: newId });
      }
    };

    window.addEventListener(LOCATION_CHANGED_EVENT, handler);
    return () => {
      window.removeEventListener(LOCATION_CHANGED_EVENT, handler);
    };
  }, [dispatch, locationId]);

  return { locationId, setLocationId };
}
