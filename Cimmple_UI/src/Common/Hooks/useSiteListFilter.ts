import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthService } from "../Services/AuthService";
import { LocationService, LOCATION_KIND, LocationMaster } from "../Services/LocationService";
import { useActiveLocation } from "./useActiveLocation";

const isWorkingSite = (loc: { locType?: number | null }) => {
  const t = loc.locType;
  return (
    t == null ||
    t === 0 ||
    t === LOCATION_KIND.BusinessSite ||
    t === LOCATION_KIND.Warehouse
  );
};

/**
 * Site filter for shared multi-site list pages.
 * Defaults to the TopBar working site so switching location reloads that site's data.
 * Users can still choose "All sites" for a tenant-wide view.
 */
export function useSiteListFilter() {
  const { locationId: workingSiteId } = useActiveLocation();

  const isLocationAllowed = useCallback((locationId: number) => {
    if (locationId <= 0) return false;
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      if (storage?.canAccessAllLocations) return true;
      const allowed = AuthService.getAllowedLocations();
      return allowed.some((l) => l.locationId === locationId);
    } catch {
      return false;
    }
  }, []);

  const [sites, setSites] = useState<LocationMaster[]>([]);
  const [locationFilter, setLocationFilter] = useState<number | "">(() => {
    if (workingSiteId > 0) {
      try {
        const storage = JSON.parse(localStorage.getItem("storage") || "{}");
        if (storage?.canAccessAllLocations) return workingSiteId;
        const allowed = AuthService.getAllowedLocations();
        if (allowed.some((l) => l.locationId === workingSiteId)) return workingSiteId;
      } catch {
        /* ignore */
      }
    }
    return "";
  });

  // Follow TopBar working site when it changes (including after Layout remount).
  useEffect(() => {
    if (workingSiteId <= 0) return;
    if (!isLocationAllowed(workingSiteId)) {
      setLocationFilter("");
      return;
    }
    setLocationFilter(workingSiteId);
  }, [workingSiteId, isLocationAllowed]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storage = JSON.parse(localStorage.getItem("storage") || "{}");
        const tenantId = storage?.tenantID || 0;
        const canAccessAll = !!storage?.canAccessAllLocations;
        const cached = AuthService.getAllowedLocations();

        let list: LocationMaster[] = [];
        // Prefer login-cached locations (including admins) to skip a redundant GetLocations call.
        if (cached.length > 0) {
          list = cached.map((l) => ({
            locationId: l.locationId,
            name: l.name || "",
            code: l.code || "",
            locType: l.locType,
            address: "",
            city: "",
            state: "",
            zip: "",
            country: "",
            region: "",
            email: "",
            phone: "",
            webaddress: "",
            status: "Active",
          }));
        } else if (canAccessAll && tenantId > 0) {
          const data = await LocationService.GetLocations({ tenantid: tenantId });
          list = Array.isArray(data) ? data : [];
        }
        // Restricted users with empty cache: leave list empty (no tenant-wide fallback).
        if (!cancelled) {
          setSites(list.filter(isWorkingSite));
        }
      } catch {
        if (!cancelled) setSites([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Drop a working-site filter the user is not allowed to query (avoids API 403).
  useEffect(() => {
    if (locationFilter === "" || locationFilter <= 0) return;
    if (!isLocationAllowed(Number(locationFilter))) {
      setLocationFilter("");
    }
  }, [locationFilter, isLocationAllowed]);

  const filterOptions = useMemo(
    () => [
      { value: "", label: "All sites" },
      ...sites.map((s) => ({
        value: String(s.locationId),
        label:
          workingSiteId === s.locationId
            ? `${s.name || s.code} (working site)`
            : s.name || s.code || `Site ${s.locationId}`,
      })),
    ],
    [sites, workingSiteId]
  );

  const onFilterChange = useCallback((value: string) => {
    setLocationFilter(value === "" ? "" : Number(value));
  }, []);

  /** Pass to list APIs; undefined means all sites. */
  const locationIdParam =
    locationFilter === "" || locationFilter <= 0
      ? undefined
      : isLocationAllowed(Number(locationFilter))
        ? Number(locationFilter)
        : undefined;

  const masterListFilter = useMemo(
    () => ({
      label: "Site",
      options: filterOptions,
      value: locationFilter === "" ? "" : String(locationFilter),
      onChange: onFilterChange,
    }),
    [filterOptions, locationFilter, onFilterChange]
  );

  return {
    locationFilter,
    setLocationFilter,
    locationIdParam,
    masterListFilter,
    sites,
  };
}
