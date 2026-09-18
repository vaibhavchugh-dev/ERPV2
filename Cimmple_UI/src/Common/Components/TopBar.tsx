import React, { useState, useRef, useEffect, useCallback } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faUser,
  faSignOutAlt,
  faChevronDown,
  faMapMarkerAlt,
  faIdCard,
  faKey,
  faCog,
  faKeyboard,
  faInfoCircle,
  faBell,
  faEnvelope,
} from "@fortawesome/free-solid-svg-icons";
import { User } from "../Services/User";
import { GlobalSearchService, SearchResult, GlobalSearchResults } from "../Services/GlobalSearchService";
import { LocationService, LocationMaster, LOCATION_KIND } from "../Services/LocationService";
import { AuthService } from "../Services/AuthService";
import { NotificationService, AppNotification } from "../Services/NotificationService";
import { isInAppNotificationsEnabled } from "../Utils/settingsRuntime";
import { useActiveLocation } from "../Hooks/useActiveLocation";
import SearchResultsDropdown from "./SearchResultsDropdown";
import UserAccountModals, { UserAccountModalKind } from "./UserAccountModals";
import NotifyUserDialog from "./NotifyUserDialog";
import "./TopBar.scss";

const NOTIFICATION_POLL_MS = 45000;

/** Working locations for the switcher: sites and warehouses (not bins/shelves/zones). */
const isWorkingLocation = (loc: { locType?: number | null }) => {
  const t = loc.locType;
  return (
    t == null ||
    t === 0 ||
    t === LOCATION_KIND.BusinessSite ||
    t === LOCATION_KIND.Warehouse
  );
};

const TopBar: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { locationId: currentLocationId, setLocationId } = useActiveLocation();
  
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [accountModal, setAccountModal] = useState<UserAccountModalKind>(null);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [locations, setLocations] = useState<LocationMaster[]>([]);
  const [currentLocation, setCurrentLocation] = useState<LocationMaster | null>(null);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GlobalSearchResults>(GlobalSearchService.emptyResults());
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const locationMenuRef = useRef<HTMLDivElement>(null);
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const readStorageProfile = () => {
    const storageObj = JSON.parse(localStorage.getItem("storage") || "{}");
    return {
      userName: storageObj?.userName || "User",
      userEmail: storageObj?.email || "",
      userRole: storageObj?.role || "",
      tenantId: storageObj?.tenantID || (process.env.NODE_ENV === "development" ? 1 : 0),
    };
  };
  const [profile, setProfile] = useState(readStorageProfile);
  const { userName, userEmail, userRole, tenantId } = profile;
  const canOpenSettings = AuthService.hasPermissionForPath("/settings");

  useEffect(() => {
    const refreshProfile = () => setProfile(readStorageProfile());
    refreshProfile();
    void AuthService.syncCurrentUserProfile().then((user) => {
      if (user) refreshProfile();
    });
    window.addEventListener("sessionProfileUpdated", refreshProfile);
    window.addEventListener("storage", refreshProfile);
    return () => {
      window.removeEventListener("sessionProfileUpdated", refreshProfile);
      window.removeEventListener("storage", refreshProfile);
    };
  }, []);

  // Debounced search
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(async (query: string) => {
    if (!query || query.trim() === '' || tenantId === 0) {
      setSearchResults(GlobalSearchService.emptyResults());
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    try {
      const results = await GlobalSearchService.Search(query, tenantId, 5);
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults(GlobalSearchService.emptyResults());
    } finally {
      setSearchLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.trim() !== '') {
      setSearchLoading(true);
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(searchQuery);
      }, 300);
    } else {
      setSearchResults(GlobalSearchService.emptyResults());
      setSearchLoading(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, performSearch]);

  // Keyboard shortcut (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        setShowSearchResults(true);
      }
      if (event.key === 'Escape') {
        setShowSearchResults(false);
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const toLocationMaster = useCallback(
    (l: { locationId: number; name: string; code: string; locType: number }): LocationMaster => ({
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
    }),
    []
  );

  // Define loadLocations function before using it in useEffect
  const loadLocations = useCallback(async () => {
    setLoadingLocations(true);
    try {
      const storageObj = JSON.parse(localStorage.getItem("storage") || "{}");
      const canAccessAll = !!storageObj.canAccessAllLocations;
      const cached = AuthService.getAllowedLocations();

      // Login/refresh already embeds locations — prefer cache to avoid competing with list APIs.
      if (cached.length > 0) {
        setLocations(cached.map(toLocationMaster).filter(isWorkingLocation));
        return;
      }

      // Restricted users with no assigned sites must not see the full tenant list
      // (that would pick a site their JWT rejects with 403 on list APIs).
      if (!canAccessAll) {
        setLocations([]);
        return;
      }

      if (tenantId === 0) return;

      const locationsData = await LocationService.GetLocations({ tenantid: tenantId });
      if (locationsData && Array.isArray(locationsData)) {
        setLocations(locationsData.filter(isWorkingLocation));
      }
    } catch (error) {
      console.error("Error loading locations:", error);
      const cached = AuthService.getAllowedLocations();
      if (cached.length > 0) {
        setLocations(cached.map(toLocationMaster).filter(isWorkingLocation));
      } else {
        setLocations([]);
      }
    } finally {
      setLoadingLocations(false);
    }
  }, [tenantId, toLocationMaster]);

  // Define handleLocationChange function before using it in useEffect
  const handleLocationChange = useCallback((locationId: number) => {
    if (locationId === currentLocationId) {
      setLocationMenuOpen(false);
      return;
    }

    const allowed = AuthService.getAllowedLocations();
    const storageObj = JSON.parse(localStorage.getItem("storage") || "{}");
    const canAccessAll = !!storageObj.canAccessAllLocations;
    if (!canAccessAll && (allowed.length === 0 || !allowed.some((l) => l.locationId === locationId))) {
      return;
    }

    setLocationId(locationId);
    setLocationMenuOpen(false);
  }, [currentLocationId, setLocationId]);

  // Load locations on mount and whenever allowed locations are refreshed (Location Master CRUD /me sync).
  useEffect(() => {
    loadLocations();
    const onLocationsUpdated = () => {
      void loadLocations();
    };
    window.addEventListener("allowedLocationsUpdated", onLocationsUpdated);
    return () => {
      window.removeEventListener("allowedLocationsUpdated", onLocationsUpdated);
    };
  }, [loadLocations]);

  // Ensure working site is selected after login (Redux can lag behind localStorage).
  useEffect(() => {
    if (locations.length === 0) {
      // Restricted / unassigned: clear any stale working site so list APIs don't 403.
      if (currentLocationId > 0) {
        const storageObj = JSON.parse(localStorage.getItem("storage") || "{}");
        const canAccessAll = !!storageObj.canAccessAllLocations;
        const allowed = AuthService.getAllowedLocations();
        if (!canAccessAll && allowed.length === 0) {
          setLocationId(0);
        }
      }
      return;
    }

    const storedLocationId = Number(localStorage.getItem("locationId") || 0);
    const defaultLocationId = Number(localStorage.getItem("defaultLocationId") || 0);

    let targetId =
      currentLocationId > 0
        ? currentLocationId
        : storedLocationId > 0
          ? storedLocationId
          : defaultLocationId > 0
            ? defaultLocationId
            : locations[0].locationId;

    const exists = locations.some((loc) => loc.locationId === targetId);
    if (!exists) {
      targetId = locations[0].locationId;
    }

    if (targetId > 0 && targetId !== currentLocationId) {
      handleLocationChange(targetId);
    }
  }, [locations, currentLocationId, handleLocationChange, setLocationId]);

  // Update current location label when locationId changes or locations are loaded
  useEffect(() => {
    if (currentLocationId > 0 && locations.length > 0) {
      const location = locations.find(loc => loc.locationId === currentLocationId);
      setCurrentLocation(location || null);
      // If the stored location is a bin/zone (not in working list), move to first working location
      if (!location) {
        handleLocationChange(locations[0].locationId);
      }
    } else {
      setCurrentLocation(null);
    }
  }, [currentLocationId, locations, handleLocationChange]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (locationMenuRef.current && !locationMenuRef.current.contains(event.target as Node)) {
        setLocationMenuOpen(false);
      }
      if (notificationMenuRef.current && !notificationMenuRef.current.contains(event.target as Node)) {
        setNotificationMenuOpen(false);
      }
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    if (!isInAppNotificationsEnabled()) {
      setUnreadCount(0);
      return;
    }
    try {
      const count = await NotificationService.GetUnreadCount();
      setUnreadCount(count);
    } catch {
      // soft-fail polling
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!isInAppNotificationsEnabled()) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    setNotificationsLoading(true);
    try {
      const items = await NotificationService.GetMine(30, false);
      setNotifications(items);
      setUnreadCount(items.filter((n) => !n.isRead).length);
    } catch {
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  // Poll unread badge; pause when tab is hidden
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (document.visibilityState === "hidden") return;
      void refreshUnreadCount();
    };

    tick();
    timer = setInterval(tick, NOTIFICATION_POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshUnreadCount]);

  const formatNotificationTime = (iso: string) => {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const handleOpenNotifications = async () => {
    const next = !notificationMenuOpen;
    setNotificationMenuOpen(next);
    setUserMenuOpen(false);
    setLocationMenuOpen(false);
    if (next) await loadNotifications();
  };

  const handleNotificationClick = async (item: AppNotification) => {
    if (!item.isRead) {
      try {
        await NotificationService.MarkRead([item.id]);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // ignore
      }
    }
    setNotificationMenuOpen(false);
    if (item.linkPath) {
      history.push(item.linkPath);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await NotificationService.MarkAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  // Close search when route changes
  useEffect(() => {
    setShowSearchResults(false);
    setSearchQuery('');
    setNotificationMenuOpen(false);
  }, [location.pathname]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setShowSearchResults(true);
  };

  const getFirstResult = (resultsData: GlobalSearchResults = searchResults): SearchResult | null => {
    if (!resultsData) return null;
    const categories: (keyof GlobalSearchResults)[] = [
      'customers', 'vendors', 'products', 'rawMaterials', 'orders', 'invoices', 'jobOrders', 'quotations',
      'vendorOrders', 'vendorInvoices', 'vendorReceiving', 'vendorQuotations', 'banks', 'workstations',
      'locations', 'processes', 'jobTemplates', 'priceBreakdowns', 'creditCards', 'chartOfAccounts',
      'shipments', 'ncrReports', 'users', 'employees', 'documents'
    ];
    for (const cat of categories) {
      const list = resultsData[cat];
      if (list && list.length > 0) {
        return list[0];
      }
    }
    return null;
  };

  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = searchQuery.trim();
      if (!trimmed) return;

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }

      let currentResults = searchResults;

      const existingFirst = getFirstResult(currentResults);
      if (!existingFirst || searchLoading) {
        try {
          setSearchLoading(true);
          currentResults = await GlobalSearchService.Search(trimmed, tenantId, 5);
          setSearchResults(currentResults);
        } catch (err) {
          console.error("Immediate search error on Enter:", err);
        } finally {
          setSearchLoading(false);
        }
      }

      const firstResult = getFirstResult(currentResults);
      if (firstResult) {
        handleResultClick(firstResult);
      }
    }
  };

  const handleSearchFocus = () => {
    if (searchQuery.trim() !== '') {
      setShowSearchResults(true);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    const url = GlobalSearchService.getResultUrl(result);
    
    // Navigate to the page
    history.push(url);
    
    // Close search
    setShowSearchResults(false);
    setSearchQuery('');
    searchInputRef.current?.blur();

    // For pages that support opening slideouts via URL params, the component will handle it
    // ProductMaster opens by part number; others by numeric id
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openEntity', { 
        detail: {
          type: result.type,
          id: result.type === 'product'
            ? (result.partNo || result.code || String(result.id))
            : result.id,
        }
      }));
    }, 100);
  };

  const handleLogout = async () => {
    try {
      await AuthService.logout();
    } catch {
      AuthService.clearSession("erp");
    }
    User.isAuthenticated = false;
    history.push("/login");
  };

  const closeUserMenu = () => setUserMenuOpen(false);

  const openAccountModal = (kind: Exclude<UserAccountModalKind, null>) => {
    closeUserMenu();
    setAccountModal(kind);
  };

  const navigateFromMenu = (path: string) => {
    closeUserMenu();
    history.push(path);
  };

  const totalResults = 
    searchResults.customers.length +
    searchResults.vendors.length +
    searchResults.orders.length +
    searchResults.invoices.length +
    searchResults.jobOrders.length +
    searchResults.quotations.length;

  return (
    <header className="top-header">
      <div className="header-left">
        <div className="search-box" ref={searchBoxRef}>
          <FontAwesomeIcon icon={faSearch} size="sm" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search customers, orders, invoices... (Ctrl+K)"
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={handleSearchFocus}
            onKeyDown={handleSearchKeyDown}
          />
          {showSearchResults && (
            <SearchResultsDropdown
              results={searchResults}
              loading={searchLoading}
              query={searchQuery}
              onResultClick={handleResultClick}
              onClose={() => setShowSearchResults(false)}
            />
          )}
        </div>
      </div>
      <div className="header-right">
        {/* Location Switcher */}
        {locations.length > 0 && (
          <div className="location-menu" ref={locationMenuRef}>
            <button
              className="location-menu-btn"
              onClick={() => setLocationMenuOpen(!locationMenuOpen)}
              title={currentLocation ? `Working site: ${currentLocation.name}` : 'Select working site'}
            >
              <FontAwesomeIcon icon={faMapMarkerAlt} size="sm" />
              <span className="location-name">
                {currentLocation ? currentLocation.name : 'Select Site'}
              </span>
              <FontAwesomeIcon icon={faChevronDown} size="xs" />
            </button>
            {locationMenuOpen && (
              <div className="location-dropdown">
                <div className="dropdown-header">
                  <FontAwesomeIcon icon={faMapMarkerAlt} size="sm" />
                  <div>
                    <div className="dropdown-name">Working site</div>
                    <div className="dropdown-email">Lists follow this site; choose All sites on a page for tenant-wide view</div>
                  </div>
                </div>
                <div className="dropdown-divider"></div>
                {loadingLocations ? (
                  <div className="dropdown-item" style={{ justifyContent: 'center', color: '#6b7280' }}>
                    Loading locations...
                  </div>
                ) : (
                  locations.map(loc => (
                    <button
                      key={loc.locationId}
                      className={`dropdown-item ${currentLocationId === loc.locationId ? 'active' : ''}`}
                      onClick={() => handleLocationChange(loc.locationId)}
                    >
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontWeight: currentLocationId === loc.locationId ? 600 : 400 }}>
                          {loc.name}
                        </div>
                        {loc.code && (
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
                            {loc.code}
                          </div>
                        )}
                        {loc.address && (
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.125rem' }}>
                            {loc.address}
                          </div>
                        )}
                      </div>
                      {currentLocationId === loc.locationId && (
                        <div style={{ color: '#10b981', fontSize: '0.75rem' }}>✓</div>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Notifications */}
        <div className="notification-menu" ref={notificationMenuRef}>
          <button
            type="button"
            className="notification-menu-btn"
            onClick={() => void handleOpenNotifications()}
            title="Notifications"
            aria-label="Notifications"
          >
            <FontAwesomeIcon icon={faBell} size="sm" />
            {unreadCount > 0 && (
              <span className="notification-badge">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
          {notificationMenuOpen && (
            <div className="notification-dropdown">
              <div className="notification-dropdown-header">
                <div className="notification-dropdown-title">Notifications</div>
                <div className="notification-dropdown-actions">
                  <button
                    type="button"
                    className="notification-link-btn"
                    onClick={() => {
                      setNotificationMenuOpen(false);
                      setNotifyDialogOpen(true);
                    }}
                  >
                    <FontAwesomeIcon icon={faEnvelope} size="xs" />
                    Notify user
                  </button>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className="notification-link-btn"
                      onClick={() => void handleMarkAllRead()}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
              </div>
              <div className="dropdown-divider"></div>
              <div className="notification-list">
                {!isInAppNotificationsEnabled() ? (
                  <div className="notification-empty">
                    In-app notifications are disabled in System Settings.
                  </div>
                ) : notificationsLoading ? (
                  <div className="notification-empty">Loading…</div>
                ) : notifications.length === 0 ? (
                  <div className="notification-empty">No notifications yet</div>
                ) : (
                  notifications.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`notification-item ${item.isRead ? "" : "unread"}`}
                      onClick={() => void handleNotificationClick(item)}
                    >
                      <div className="notification-item-title">{item.title}</div>
                      {item.body && (
                        <div className="notification-item-body">{item.body}</div>
                      )}
                      <div className="notification-item-meta">
                        {formatNotificationTime(item.createdAt)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="user-menu" ref={userMenuRef}>
          <button
            className="user-menu-btn"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
          >
            <div className="user-avatar-small">
              <FontAwesomeIcon icon={faUser} size="sm" />
            </div>
            <span>{userName}</span>
            <FontAwesomeIcon icon={faChevronDown} size="sm" />
          </button>
          {userMenuOpen && (
            <div className="user-dropdown">
              <div className="dropdown-header">
                <div className="user-avatar-small">
                  <FontAwesomeIcon icon={faUser} size="sm" />
                </div>
                <div className="dropdown-user-meta">
                  <div className="dropdown-name">{userName}</div>
                  {userEmail && <div className="dropdown-email">{userEmail}</div>}
                  {userRole && <div className="dropdown-role">Role: {userRole}</div>}
                </div>
              </div>
              <div className="dropdown-divider"></div>
              <button
                type="button"
                className="dropdown-item"
                onClick={() => openAccountModal("profile")}
              >
                <FontAwesomeIcon icon={faIdCard} size="sm" />
                <span>My Profile</span>
              </button>
              <button
                type="button"
                className="dropdown-item"
                onClick={() => navigateFromMenu("/change-password")}
              >
                <FontAwesomeIcon icon={faKey} size="sm" />
                <span>Change Password</span>
              </button>
              {canOpenSettings && (
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => navigateFromMenu("/settings")}
                >
                  <FontAwesomeIcon icon={faCog} size="sm" />
                  <span>System Settings</span>
                </button>
              )}
              <div className="dropdown-divider"></div>
              <button
                type="button"
                className="dropdown-item"
                onClick={() => openAccountModal("help")}
              >
                <FontAwesomeIcon icon={faKeyboard} size="sm" />
                <span>Help &amp; Shortcuts</span>
              </button>
              <button
                type="button"
                className="dropdown-item"
                onClick={() => openAccountModal("about")}
              >
                <FontAwesomeIcon icon={faInfoCircle} size="sm" />
                <span>About</span>
              </button>
              <div className="dropdown-divider"></div>
              <button type="button" className="dropdown-item dropdown-item-danger" onClick={handleLogout}>
                <FontAwesomeIcon icon={faSignOutAlt} size="sm" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <UserAccountModals
        kind={accountModal}
        onClose={() => setAccountModal(null)}
        onChangePassword={() => {
          setAccountModal(null);
          history.push("/change-password");
        }}
      />
      <NotifyUserDialog
        open={notifyDialogOpen}
        onClose={() => setNotifyDialogOpen(false)}
        onSent={() => {
          void refreshUnreadCount();
        }}
      />
    </header>
  );
};

export default TopBar;
