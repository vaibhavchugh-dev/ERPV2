import React, { useState, useRef, useEffect, useCallback } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faUser, faSignOutAlt, faChevronDown, faMapMarkerAlt } from "@fortawesome/free-solid-svg-icons";
import { User } from "../Services/User";
import { GlobalSearchService, SearchResult, GlobalSearchResults } from "../Services/GlobalSearchService";
import { LocationService, LocationMaster } from "../Services/LocationService";
import SearchResultsDropdown from "./SearchResultsDropdown";
import "./TopBar.scss";

const TopBar: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const dispatch = useDispatch();
  const currentLocationId = useSelector((state: any) => state.LocationReducer?.locationId || 0);
  
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [locations, setLocations] = useState<LocationMaster[]>([]);
  const [currentLocation, setCurrentLocation] = useState<LocationMaster | null>(null);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GlobalSearchResults>({
    customers: [],
    vendors: [],
    orders: [],
    invoices: [],
    jobOrders: [],
    quotations: [],
    banks: [],
    workstations: [],
    locations: [],
    processes: [],
    jobTemplates: [],
    priceBreakdowns: [],
    creditCards: [],
    chartOfAccounts: [],
    vendorOrders: [],
    vendorInvoices: [],
    vendorReceiving: [],
    vendorQuotations: [],
    shipments: [],
    ncrReports: [],
    users: [],
    documents: []
  });
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const locationMenuRef = useRef<HTMLDivElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const storage = JSON.parse(localStorage.getItem("storage") || "{}");
  const userName = storage?.userName || "User";
  const userEmail = storage?.email || "";
  const tenantId = storage?.tenantID || (process.env.NODE_ENV === 'development' ? 1 : 0);

  // Debounced search
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(async (query: string) => {
    if (!query || query.trim() === '' || tenantId === 0) {
      setSearchResults({
        customers: [],
        vendors: [],
        orders: [],
        invoices: [],
        jobOrders: [],
        quotations: [],
        banks: [],
        workstations: [],
        locations: [],
        processes: [],
        jobTemplates: [],
        priceBreakdowns: [],
        creditCards: [],
        chartOfAccounts: [],
        vendorOrders: [],
        vendorInvoices: [],
        vendorReceiving: [],
        vendorQuotations: [],
        shipments: [],
        ncrReports: [],
        users: [],
        documents: []
      });
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    try {
      const results = await GlobalSearchService.Search(query, tenantId, 5);
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults({
        customers: [],
        vendors: [],
        orders: [],
        invoices: [],
        jobOrders: [],
        quotations: [],
        banks: [],
        workstations: [],
        locations: [],
        processes: [],
        jobTemplates: [],
        priceBreakdowns: [],
        creditCards: [],
        chartOfAccounts: [],
        vendorOrders: [],
        vendorInvoices: [],
        vendorReceiving: [],
        vendorQuotations: [],
        shipments: [],
        ncrReports: [],
        users: [],
        documents: []
      });
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
      setSearchResults({
        customers: [],
        vendors: [],
        orders: [],
        invoices: [],
        jobOrders: [],
        quotations: [],
        banks: [],
        workstations: [],
        locations: [],
        processes: [],
        jobTemplates: [],
        priceBreakdowns: [],
        creditCards: [],
        chartOfAccounts: [],
        vendorOrders: [],
        vendorInvoices: [],
        vendorReceiving: [],
        vendorQuotations: [],
        shipments: [],
        ncrReports: [],
        users: [],
        documents: []
      });
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

  // Define loadLocations function before using it in useEffect
  const loadLocations = useCallback(async () => {
    if (tenantId === 0) return;
    
    setLoadingLocations(true);
    try {
      const locationsData = await LocationService.GetLocations({ tenantid: tenantId });
      if (locationsData && Array.isArray(locationsData)) {
        setLocations(locationsData);
      }
    } catch (error) {
      console.error('Error loading locations:', error);
    } finally {
      setLoadingLocations(false);
    }
  }, [tenantId]);

  // Define handleLocationChange function before using it in useEffect
  const handleLocationChange = useCallback((locationId: number) => {
    if (locationId === currentLocationId) {
      setLocationMenuOpen(false);
      return;
    }
    
    dispatch({ type: 'SET_LOCATION', payload: locationId });
    localStorage.setItem('locationId', locationId.toString());
    
    // Dispatch custom event for other components to listen
    window.dispatchEvent(new CustomEvent('locationChanged', { 
      detail: { locationId } 
    }));
    
    setLocationMenuOpen(false);
  }, [currentLocationId, dispatch]);

  // Load locations on mount
  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  // Initialize location from defaultLocationId if no current location
  useEffect(() => {
    const storedLocationId = localStorage.getItem('locationId');
    const locationIdFromStorage = storedLocationId ? parseInt(storedLocationId, 10) : 0;
    
    if ((!locationIdFromStorage || locationIdFromStorage === 0) && locations.length > 0) {
      const defaultLocationId = localStorage.getItem('defaultLocationId');
      if (defaultLocationId) {
        const locationId = parseInt(defaultLocationId, 10);
        if (!isNaN(locationId) && locationId > 0) {
          // Check if the default location exists in the loaded locations
          const locationExists = locations.some(loc => loc.locationId === locationId);
          if (locationExists) {
            handleLocationChange(locationId);
          }
        }
      } else if (locations.length > 0) {
        // If no default location is set, use the first location
        handleLocationChange(locations[0].locationId);
      }
    }
  }, [locations, handleLocationChange]); // Run when locations are loaded

  // Update current location when locationId changes or locations are loaded
  useEffect(() => {
    if (currentLocationId > 0 && locations.length > 0) {
      const location = locations.find(loc => loc.locationId === currentLocationId);
      setCurrentLocation(location || null);
    } else {
      setCurrentLocation(null);
    }
  }, [currentLocationId, locations]);

  // Listen for location changes from other components
  useEffect(() => {
    const handleLocationChanged = (event: CustomEvent) => {
      const newLocationId = event.detail?.locationId;
      if (newLocationId && newLocationId !== currentLocationId) {
        dispatch({ type: 'SET_LOCATION', payload: newLocationId });
      }
    };

    window.addEventListener('locationChanged', handleLocationChanged as EventListener);
    return () => {
      window.removeEventListener('locationChanged', handleLocationChanged as EventListener);
    };
  }, [currentLocationId, dispatch]);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (locationMenuRef.current && !locationMenuRef.current.contains(event.target as Node)) {
        setLocationMenuOpen(false);
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

  // Close search when route changes
  useEffect(() => {
    setShowSearchResults(false);
    setSearchQuery('');
  }, [location.pathname]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setShowSearchResults(true);
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
    // Otherwise, we'll need to trigger the slideout programmatically
    setTimeout(() => {
      // Trigger a custom event that components can listen to
      window.dispatchEvent(new CustomEvent('openEntity', { 
        detail: { type: result.type, id: result.id } 
      }));
    }, 100);
  };

  const handleLogout = () => {
    localStorage.clear();
    User.isAuthenticated = false;
    history.push("/login");
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
              title={currentLocation ? `Current location: ${currentLocation.name}` : 'Select location'}
            >
              <FontAwesomeIcon icon={faMapMarkerAlt} size="sm" />
              <span className="location-name">
                {currentLocation ? currentLocation.name : 'Select Location'}
              </span>
              <FontAwesomeIcon icon={faChevronDown} size="xs" />
            </button>
            {locationMenuOpen && (
              <div className="location-dropdown">
                <div className="dropdown-header">
                  <FontAwesomeIcon icon={faMapMarkerAlt} size="sm" />
                  <div>
                    <div className="dropdown-name">Switch Location</div>
                    <div className="dropdown-email">Select your working location</div>
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
                <div>
                  <div className="dropdown-name">{userName}</div>
                  {userEmail && <div className="dropdown-email">{userEmail}</div>}
                </div>
              </div>
              <div className="dropdown-divider"></div>
              <button className="dropdown-item" onClick={handleLogout}>
                <FontAwesomeIcon icon={faSignOutAlt} size="sm" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
