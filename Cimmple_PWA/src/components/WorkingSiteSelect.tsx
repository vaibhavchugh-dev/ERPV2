import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import { AuthService } from "../services/authService";

/**
 * Working site selector for PWA — makes location filter visible and changeable.
 * Value 0 = All sites (only when user can access all locations).
 */
export function WorkingSiteSelect({
  className = "",
  onChanged,
}: {
  className?: string;
  onChanged?: () => void;
}) {
  const { locationId, setLocationId } = useAuth();
  const storage = AuthService.getStorage();
  const locations = useMemo(() => AuthService.getAllowedLocations(), [locationId]);
  const canAll = Boolean(storage?.canAccessAllLocations);

  if (!canAll && locations.length <= 1) {
    const only = locations[0];
    if (!only) return null;
    return (
      <div className={`text-xs font-semibold text-slate-500 dark:text-slate-300 ${className}`}>
        {only.name || only.code || `Site ${only.locationId}`}
      </div>
    );
  }

  return (
    <label className={`flex items-center gap-2 ${className}`}>
      <span className="sr-only">Working site</span>
      <select
        className="h-9 max-w-[11rem] rounded-xl border-none bg-[#f0f3f7] px-3 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
        value={locationId > 0 ? String(locationId) : "0"}
        onChange={(e) => {
          const next = Number(e.target.value) || 0;
          setLocationId(next);
          onChanged?.();
        }}
      >
        {canAll && <option value="0">All sites</option>}
        {locations.map((loc) => (
          <option key={loc.locationId} value={String(loc.locationId)}>
            {loc.name || loc.code || `Site ${loc.locationId}`}
          </option>
        ))}
      </select>
    </label>
  );
}
