import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const mapCachedToMaster = (l: {
  locationId: number;
  name: string;
  code: string;
  locType: number;
}): LocationMaster => ({
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
});

/**
 * Read report deep-link site scope from the current URL.
 * - missing → null (no deep-link seed)
 * - locationId=0 → "" (All sites)
 * - locationId=N → N
 */
function readUrlLocationSeed(): number | "" | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("locationId") ?? params.get("site");
    if (raw === null) return null;
    if (raw === "" || raw === "0") return "";
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  } catch {
    return null;
  }
}

function isAllowedLocationId(locationId: number): boolean {
  if (locationId <= 0) return false;
  try {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    if (storage?.canAccessAllLocations) return true;
    const allowed = AuthService.getAllowedLocations();
    return allowed.some((l) => l.locationId === locationId);
  } catch {
    return false;
  }
}

/**
 * Site filter for shared multi-site list pages and Reports.
 *
 * Behaviour:
 * - Defaults to the TopBar **working site** so switching location reloads that site's data.
 * - Users can choose **All sites** for a tenant-wide view (no locationId sent to APIs).
 * - Documents / jobs / invoices / POs / NCRs without a resolvable site only appear under All sites.
 * - Report deep links may pass ?locationId= (or 0 for All sites); that seed is kept until the
 *   working site changes or the user picks a different Site filter.
 */
export function useSiteListFilter() {
  const { locationId: workingSiteId } = useActiveLocation();

  const isLocationAllowed = useCallback(
    (locationId: number) => isAllowedLocationId(locationId),
    []
  );

  const deepLinkSeedRef = useRef<{
    locationId: number | "";
    workingSiteAtSeed: number;
  } | null>(null);

  const [sites, setSites] = useState<LocationMaster[]>([]);
  const [locationFilter, setLocationFilter] = useState<number | "">(() => {
    const fromUrl = readUrlLocationSeed();
    if (fromUrl !== null) {
      if (fromUrl === "" || isAllowedLocationId(fromUrl)) {
        deepLinkSeedRef.current = {
          locationId: fromUrl,
          workingSiteAtSeed: workingSiteId,
        };
        return fromUrl;
      }
    }
    if (workingSiteId > 0 && isAllowedLocationId(workingSiteId)) {
      return workingSiteId;
    }
    return "";
  });

  // Follow TopBar working site when it changes (including after Layout remount),
  // unless a report deep-link still owns the filter for this working-site value.
  useEffect(() => {
    if (workingSiteId <= 0) return;
    if (!isLocationAllowed(workingSiteId)) {
      setLocationFilter("");
      return;
    }
    const seed = deepLinkSeedRef.current;
    if (seed && seed.workingSiteAtSeed === workingSiteId) {
      return;
    }
    deepLinkSeedRef.current = null;
    setLocationFilter(workingSiteId);
  }, [workingSiteId, isLocationAllowed]);

  const loadSites = useCallback(async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantId = storage?.tenantID || 0;
      const canAccessAll = !!storage?.canAccessAllLocations;
      const cached = AuthService.getAllowedLocations();

      let list: LocationMaster[] = [];
      // Prefer login-cached locations (including admins) to skip a redundant GetLocations call.
      if (cached.length > 0) {
        list = cached.map(mapCachedToMaster);
      } else if (canAccessAll && tenantId > 0) {
        const data = await LocationService.GetLocations({ tenantid: tenantId });
        list = Array.isArray(data) ? data : [];
      }
      // Restricted users with empty cache: leave list empty (no tenant-wide fallback).
      setSites(list.filter(isWorkingSite));
    } catch {
      setSites([]);
    }
  }, []);

  useEffect(() => {
    void loadSites();
    const onLocationsUpdated = () => {
      void loadSites();
    };
    window.addEventListener("allowedLocationsUpdated", onLocationsUpdated);
    return () => {
      window.removeEventListener("allowedLocationsUpdated", onLocationsUpdated);
    };
  }, [loadSites]);

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
    deepLinkSeedRef.current = null;
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

  /** Short label for the active site selection (UI hints / report preview). */
  const siteScopeLabel = useMemo(() => {
    if (locationFilter === "" || locationFilter <= 0) return "All sites";
    const site = sites.find((s) => s.locationId === Number(locationFilter));
    const name = site?.name || site?.code || `Site #${locationFilter}`;
    return workingSiteId === Number(locationFilter)
      ? `${name} (working site)`
      : name;
  }, [locationFilter, sites, workingSiteId]);

  return {
    locationFilter,
    setLocationFilter,
    locationIdParam,
    masterListFilter,
    siteScopeLabel,
    sites,
  };
}
