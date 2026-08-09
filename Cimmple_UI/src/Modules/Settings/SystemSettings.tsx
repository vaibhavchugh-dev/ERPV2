import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { faSave, faCog, faBuilding, faClock, faDollarSign, faShieldAlt, faEnvelope, faMapMarkerAlt, faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { SystemSettingsService, SystemSettings } from "../../Common/Services/SystemSettingsService";
import { LocationService, LocationMaster } from "../../Common/Services/LocationService";
import { AuthService } from "../../Common/Services/AuthService";
import { notifyLocationChanged } from "../../Common/Hooks/useActiveLocation";
import { useHistory } from "react-router-dom";
import "./SystemSettings.scss";

const SystemSettingsComponent: React.FC = () => {
  const history = useHistory();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [locations, setLocations] = useState<LocationMaster[]>([]);
  const [defaultLocationId, setDefaultLocationId] = useState<number>(0);
  const [selectedLocation, setSelectedLocation] = useState<LocationMaster | null>(null);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [activeTab, setActiveTab] = useState<'company' | 'datetime' | 'currency' | 'security' | 'email' | 'general'>('company');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenantId, setTenantId] = useState(1);

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tid = storage?.tenantID || 1;
    setTenantId(tid);
    loadSettings();
    loadLocations();
    loadDefaultLocation();
  }, []);

  useEffect(() => {
    if (defaultLocationId > 0 && locations.length > 0) {
      const location = locations.find(loc => loc.locationId === defaultLocationId);
      setSelectedLocation(location || null);
    } else {
      setSelectedLocation(null);
    }
  }, [defaultLocationId, locations]);

  const loadSettings = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tid = storage?.tenantID || 1;
      const settingsData = await SystemSettingsService.GetSettings(tid);
      setSettings(settingsData);
    } catch (error) {
      console.error('Error loading system settings:', error);
      toast.error('Failed to load system settings');
    } finally {
      setLoading(false);
    }
  };

  const loadLocations = async () => {
    setLoadingLocations(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tid = storage?.tenantID || 1;
      const locationsData = await LocationService.GetLocations({ tenantid: tid });
      if (locationsData && Array.isArray(locationsData)) {
        setLocations(locationsData);
      }
    } catch (error) {
      console.error('Error loading locations:', error);
      toast.error('Failed to load locations');
    } finally {
      setLoadingLocations(false);
    }
  };

  const loadDefaultLocation = () => {
    const storedDefaultLocationId = localStorage.getItem('defaultLocationId');
    if (storedDefaultLocationId) {
      const locationId = parseInt(storedDefaultLocationId, 10);
      if (!isNaN(locationId) && locationId > 0) {
        setDefaultLocationId(locationId);
      }
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    
    // Validation
    if (settings.minPasswordLength < 6 || settings.minPasswordLength > 20) {
      toast.error('Password length must be between 6 and 20 characters');
      return;
    }
    if (settings.sessionTimeoutMinutes < 5 || settings.sessionTimeoutMinutes > 480) {
      toast.error('Session timeout must be between 5 and 480 minutes');
      return;
    }
    if (settings.smtpPort && (settings.smtpPort < 1 || settings.smtpPort > 65535)) {
      toast.error('SMTP port must be between 1 and 65535');
      return;
    }
    
    setSaving(true);
    try {
      await SystemSettingsService.SaveSettings({
        ...settings,
        tenantId
      });
      toast.success('System settings saved successfully');
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error(`Failed to save settings: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDefaultLocation = async () => {
    if (defaultLocationId === 0) {
      toast.error('Please select a default location');
      return;
    }

    setSaving(true);
    try {
      await AuthService.setDefaultLocation(defaultLocationId);

      // Also set it as the current location if no current location is set
      const currentLocationId = localStorage.getItem('locationId');
      if (!currentLocationId || currentLocationId === '0') {
        notifyLocationChanged(defaultLocationId);
      }

      toast.success('Default location saved successfully');
    } catch (error: any) {
      console.error('Error saving default location:', error);
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Unknown error';
      toast.error(`Failed to save default location: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleLocationChange = (locationId: number) => {
    setDefaultLocationId(locationId);
  };

  const handleOpenLocationMaster = () => {
    history.push('/masters/location');
  };

  const updateSetting = (key: keyof SystemSettings, value: any) => {
    if (!settings) return;
    setSettings(prev => prev ? { ...prev, [key]: value } : null);
  };


  const tabs = [
    { id: 'company', label: 'Default Location', icon: faMapMarkerAlt },
    { id: 'datetime', label: 'Date & Time', icon: faClock },
    { id: 'currency', label: 'Currency & Numbers', icon: faDollarSign },
    { id: 'security', label: 'Security', icon: faShieldAlt },
    { id: 'email', label: 'Email Settings', icon: faEnvelope },
    { id: 'general', label: 'General', icon: faCog }
  ];

  if (loading || !settings) {
    return (
      <div className="system-settings-page" style={{ padding: '1.5rem', width: '100%' }}>
        <div className="page-loading">
          <div className="loading-spinner"></div>
          <p>Loading system settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="system-settings-page" style={{ padding: '1.5rem', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
              System Settings
            </h1>
            <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
              Configure application-wide settings, company information, and system preferences
            </p>
          </div>
          <button
            onClick={activeTab === 'company' ? handleSaveDefaultLocation : handleSaveSettings}
            disabled={saving || loading || (activeTab === 'company' && loadingLocations)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: saving ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <FontAwesomeIcon icon={faSave} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', overflowX: 'auto' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                flex: '1 1 auto',
                minWidth: '150px',
                padding: '1rem',
                backgroundColor: activeTab === tab.id ? '#f9fafb' : 'white',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: activeTab === tab.id ? '600' : '500',
                color: activeTab === tab.id ? '#3b82f6' : '#6b7280',
                whiteSpace: 'nowrap'
              }}
            >
              <FontAwesomeIcon icon={tab.icon} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: '1.5rem' }}>
          {/* Default Location */}
          {activeTab === 'company' && (
            <div>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
                Default Location
              </h3>
              <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                Select the default location to use for new documents. This location will be automatically selected when you log in.
                You can change your current working location anytime using the location switcher in the top bar.
              </p>
              
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                  Default Location *
                </label>
                {loadingLocations ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                    Loading locations...
                  </div>
                ) : locations.length === 0 ? (
                  <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderRadius: '0.375rem', border: '1px solid #fbbf24' }}>
                    <p style={{ margin: 0, color: '#92400e', fontSize: '0.875rem' }}>
                      No locations found. Please create a location first.
                    </p>
                    <button
                      onClick={handleOpenLocationMaster}
                      style={{
                        marginTop: '0.75rem',
                        padding: '0.5rem 1rem',
                        backgroundColor: '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <FontAwesomeIcon icon={faMapMarkerAlt} />
                      Go to Location Master
                    </button>
                  </div>
                ) : (
                  <select
                    value={defaultLocationId || ''}
                    onChange={(e) => handleLocationChange(parseInt(e.target.value, 10))}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      backgroundColor: 'white'
                    }}
                  >
                    <option value="">Select a location</option>
                    {locations.map(loc => (
                      <option key={loc.locationId} value={loc.locationId}>
                        {loc.name} {loc.code ? `(${loc.code})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <small style={{ color: '#6b7280', fontSize: '0.75rem', display: 'block', marginTop: '0.5rem' }}>
                  All new quotations, orders, and PDFs will use this location by default.
                </small>
              </div>

              {/* Show selected location details */}
              {selectedLocation && (
                <div style={{ 
                  marginTop: '1.5rem', 
                  padding: '1.5rem', 
                  backgroundColor: '#f9fafb', 
                  borderRadius: '0.375rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
                      Selected Location Details
                    </h4>
                    <button
                      onClick={handleOpenLocationMaster}
                      style={{
                        padding: '0.375rem 0.75rem',
                        backgroundColor: 'transparent',
                        color: '#3b82f6',
                        border: '1px solid #3b82f6',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        textDecoration: 'none'
                      }}
                    >
                      <span>Edit Location</span>
                      <FontAwesomeIcon icon={faExternalLinkAlt} />
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.875rem' }}>
                    <div>
                      <strong style={{ color: '#374151' }}>Name:</strong>
                      <span style={{ color: '#6b7280', marginLeft: '0.5rem' }}>{selectedLocation.name || 'N/A'}</span>
                    </div>
                    {selectedLocation.code && (
                      <div>
                        <strong style={{ color: '#374151' }}>Code:</strong>
                        <span style={{ color: '#6b7280', marginLeft: '0.5rem' }}>{selectedLocation.code}</span>
                      </div>
                    )}
                    {selectedLocation.address && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <strong style={{ color: '#374151' }}>Address:</strong>
                        <span style={{ color: '#6b7280', marginLeft: '0.5rem' }}>{selectedLocation.address}</span>
                      </div>
                    )}
                    {(selectedLocation.city || selectedLocation.state || selectedLocation.zip) && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <strong style={{ color: '#374151' }}>City, State ZIP:</strong>
                        <span style={{ color: '#6b7280', marginLeft: '0.5rem' }}>
                          {[selectedLocation.city, selectedLocation.state, selectedLocation.zip].filter(Boolean).join(', ') || 'N/A'}
                        </span>
                      </div>
                    )}
                    {selectedLocation.email && (
                      <div>
                        <strong style={{ color: '#374151' }}>Email:</strong>
                        <span style={{ color: '#6b7280', marginLeft: '0.5rem' }}>{selectedLocation.email}</span>
                      </div>
                    )}
                    {selectedLocation.phone && (
                      <div>
                        <strong style={{ color: '#374151' }}>Phone:</strong>
                        <span style={{ color: '#6b7280', marginLeft: '0.5rem' }}>{selectedLocation.phone}</span>
                      </div>
                    )}
                    {selectedLocation.webaddress && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <strong style={{ color: '#374151' }}>Website:</strong>
                        <span style={{ color: '#6b7280', marginLeft: '0.5rem' }}>{selectedLocation.webaddress}</span>
                      </div>
                    )}
                  </div>
                  <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>
                    To edit location details or upload a logo, click "Edit Location" above or go to <strong>Masters → Location Master</strong>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Date & Time Settings */}
          {activeTab === 'datetime' && (
            <div>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
                Date & Time Settings
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Date Format
                  </label>
                  <select
                    value={settings.dateFormat}
                    onChange={(e) => updateSetting('dateFormat', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value="M/d/yyyy">M/d/yyyy (1/15/2024)</option>
                    <option value="MM/dd/yyyy">MM/dd/yyyy (01/15/2024)</option>
                    <option value="dd/MM/yyyy">dd/MM/yyyy (15/01/2024)</option>
                    <option value="yyyy-MM-dd">yyyy-MM-dd (2024-01-15)</option>
                    <option value="MMM d, yyyy">MMM d, yyyy (Jan 15, 2024)</option>
                    <option value="MMMM d, yyyy">MMMM d, yyyy (January 15, 2024)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Time Format
                  </label>
                  <select
                    value={settings.timeFormat}
                    onChange={(e) => updateSetting('timeFormat', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value="12">12-hour (3:45 PM)</option>
                    <option value="24">24-hour (15:45)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Timezone
                  </label>
                  <select
                    value={settings.timezone}
                    onChange={(e) => updateSetting('timezone', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="America/Phoenix">Arizona Time</option>
                    <option value="America/Anchorage">Alaska Time</option>
                    <option value="Pacific/Honolulu">Hawaii Time</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Locale
                  </label>
                  <select
                    value={settings.locale}
                    onChange={(e) => updateSetting('locale', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value="en-US">English (US)</option>
                    <option value="en-GB">English (UK)</option>
                    <option value="en-CA">English (Canada)</option>
                    <option value="es-ES">Spanish (Spain)</option>
                    <option value="es-MX">Spanish (Mexico)</option>
                    <option value="fr-FR">French (France)</option>
                    <option value="de-DE">German (Germany)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Currency & Number Format */}
          {activeTab === 'currency' && (
            <div>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
                Currency & Number Formatting
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Default Currency
                  </label>
                  <select
                    value={settings.defaultCurrency}
                    onChange={(e) => updateSetting('defaultCurrency', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="CAD">CAD - Canadian Dollar</option>
                    <option value="AUD">AUD - Australian Dollar</option>
                    <option value="JPY">JPY - Japanese Yen</option>
                    <option value="CNY">CNY - Chinese Yuan</option>
                    <option value="INR">INR - Indian Rupee</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Currency Symbol
                  </label>
                  <input
                    type="text"
                    value={settings.currencySymbol}
                    onChange={(e) => updateSetting('currencySymbol', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Decimal Places
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="4"
                    value={settings.decimalPlaces}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 2;
                      updateSetting('decimalPlaces', Math.max(0, Math.min(4, val)));
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Decimal Separator
                  </label>
                  <select
                    value={settings.decimalSeparator}
                    onChange={(e) => updateSetting('decimalSeparator', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value=".">Period (.)</option>
                    <option value=",">Comma (,)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Thousands Separator
                  </label>
                  <select
                    value={settings.thousandsSeparator}
                    onChange={(e) => updateSetting('thousandsSeparator', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value=",">Comma (,)</option>
                    <option value=".">Period (.)</option>
                    <option value=" ">Space ( )</option>
                    <option value="">None</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Security Settings */}
          {activeTab === 'security' && (
            <div>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
                Security Settings
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Minimum Password Length
                  </label>
                  <input
                    type="number"
                    min="6"
                    max="20"
                    value={settings.minPasswordLength}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 8;
                      updateSetting('minPasswordLength', Math.max(6, Math.min(20, val)));
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Password Expiration (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={settings.passwordExpirationDays}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      updateSetting('passwordExpirationDays', Math.max(0, val));
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                  <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>0 = Never expire</small>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Password History Count
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={settings.passwordHistoryCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      updateSetting('passwordHistoryCount', Math.max(0, Math.min(10, val)));
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                  <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>Number of previous passwords to remember</small>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Session Timeout (Minutes)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="480"
                    value={settings.sessionTimeoutMinutes}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 30;
                      updateSetting('sessionTimeoutMinutes', Math.max(5, Math.min(480, val)));
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                  <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                    Logs out after this many minutes of inactivity. Active users stay signed in.
                  </small>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Max Concurrent Sessions
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={settings.maxConcurrentSessions}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 3;
                      updateSetting('maxConcurrentSessions', Math.max(1, Math.min(10, val)));
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Failed Login Attempts Before Lockout
                  </label>
                  <input
                    type="number"
                    min="3"
                    max="10"
                    value={settings.failedLoginAttempts}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 5;
                      updateSetting('failedLoginAttempts', Math.max(3, Math.min(10, val)));
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Account Lockout Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="1440"
                    value={settings.accountLockoutMinutes}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 15;
                      updateSetting('accountLockoutMinutes', Math.max(5, Math.min(1440, val)));
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1', marginTop: '1rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
                    Password Requirements
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.requireUppercase}
                        onChange={(e) => updateSetting('requireUppercase', e.target.checked)}
                        style={{ width: '1rem', height: '1rem' }}
                      />
                      <span style={{ fontSize: '0.875rem' }}>Require uppercase letters</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.requireLowercase}
                        onChange={(e) => updateSetting('requireLowercase', e.target.checked)}
                        style={{ width: '1rem', height: '1rem' }}
                      />
                      <span style={{ fontSize: '0.875rem' }}>Require lowercase letters</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.requireNumbers}
                        onChange={(e) => updateSetting('requireNumbers', e.target.checked)}
                        style={{ width: '1rem', height: '1rem' }}
                      />
                      <span style={{ fontSize: '0.875rem' }}>Require numbers</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.requireSpecialChars}
                        onChange={(e) => updateSetting('requireSpecialChars', e.target.checked)}
                        style={{ width: '1rem', height: '1rem' }}
                      />
                      <span style={{ fontSize: '0.875rem' }}>Require special characters</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Email Settings */}
          {activeTab === 'email' && (
            <div>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
                Email/SMTP Configuration
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    SMTP Server
                  </label>
                  <input
                    type="text"
                    value={settings.smtpServer}
                    onChange={(e) => updateSetting('smtpServer', e.target.value)}
                    placeholder="smtp.example.com"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    SMTP Port
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="65535"
                    value={settings.smtpPort}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 587;
                      updateSetting('smtpPort', Math.max(1, Math.min(65535, val)));
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                  <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>Common ports: 25, 465 (SSL), 587 (TLS)</small>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    SMTP Username
                  </label>
                  <input
                    type="text"
                    value={settings.smtpUsername}
                    onChange={(e) => updateSetting('smtpUsername', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    SMTP Password
                  </label>
                  <input
                    type="password"
                    value={settings.smtpPassword}
                    onChange={(e) => updateSetting('smtpPassword', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    From Email
                  </label>
                  <input
                    type="email"
                    value={settings.smtpFromEmail}
                    onChange={(e) => updateSetting('smtpFromEmail', e.target.value)}
                    placeholder="noreply@example.com"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    From Name
                  </label>
                  <input
                    type="text"
                    value={settings.smtpFromName}
                    onChange={(e) => updateSetting('smtpFromName', e.target.value)}
                    placeholder="Cimmple ERP"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.smtpUseSsl}
                      onChange={(e) => updateSetting('smtpUseSsl', e.target.checked)}
                      style={{ width: '1rem', height: '1rem' }}
                    />
                    <span style={{ fontSize: '0.875rem' }}>Use SSL/TLS</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* General Settings */}
          {activeTab === 'general' && (
            <div>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
                General Settings
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Default Page Size
                  </label>
                  <select
                    value={settings.defaultPageSize}
                    onChange={(e) => updateSetting('defaultPageSize', parseInt(e.target.value) || 10)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value="5">5 items per page</option>
                    <option value="10">10 items per page</option>
                    <option value="25">25 items per page</option>
                    <option value="50">50 items per page</option>
                    <option value="100">100 items per page</option>
                  </select>
                  <small style={{ color: '#6b7280', fontSize: '0.75rem', display: 'block', marginTop: '0.5rem' }}>
                    Default number of items displayed in list views
                  </small>
                </div>
                <div style={{ gridColumn: '1 / -1', marginTop: '1rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
                    Notification Preferences
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.enableEmailNotifications}
                        onChange={(e) => updateSetting('enableEmailNotifications', e.target.checked)}
                        style={{ width: '1rem', height: '1rem' }}
                      />
                      <span style={{ fontSize: '0.875rem' }}>Enable email notifications</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.enableInAppNotifications}
                        onChange={(e) => updateSetting('enableInAppNotifications', e.target.checked)}
                        style={{ width: '1rem', height: '1rem' }}
                      />
                      <span style={{ fontSize: '0.875rem' }}>Enable in-app notifications</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemSettingsComponent;

