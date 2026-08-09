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
  const [sites, setSites] = useState<LocationMaster[]>([]);
  const [locationFilter, setLocationFilter] = useState<number | "">(
    () => (workingSiteId > 0 ? workingSiteId : "")
  );

  // Follow TopBar working site when it changes (including after Layout remount).
  useEffect(() => {
    if (workingSiteId > 0) {
      setLocationFilter(workingSiteId);
    }
  }, [workingSiteId]);

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
        } else if (tenantId > 0) {
          const data = await LocationService.GetLocations({ tenantid: tenantId });
          list = Array.isArray(data) ? data : [];
          if (!canAccessAll && cached.length > 0) {
            const allowed = new Set(cached.map((l) => l.locationId));
            list = list.filter((l) => allowed.has(l.locationId));
          }
        }
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
    locationFilter === "" || locationFilter <= 0 ? undefined : Number(locationFilter);

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
