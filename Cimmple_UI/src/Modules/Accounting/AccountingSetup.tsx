import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { faSave, faCog, faCalculator, faCalendar, faBook } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AccountingService } from "../../Common/Services/AccountingService";
import { ChartofAccountsService, ChartofAccountMaster } from "../../Common/Services/ChartofAccountsService";

interface AccountingSettings {
  companyName: string;
  fiscalYearStart: string;
  defaultCurrency: string;
  taxRate: number;
  defaultAccountsReceivableAccountId?: number;
  defaultAccountsPayableAccountId?: number;
  defaultRevenueAccountId?: number;
  defaultExpenseAccountId?: number;
  defaultInventoryAccountId?: number;
  defaultSalesTaxPayableAccountId?: number;
  defaultInputTaxAccountId?: number;
  defaultFreightOutAccountId?: number;
  defaultOtherChargeAccountId?: number;
  defaultFreightInAccountId?: number;
  paymentTerms: PaymentTerm[];
  approvalLimits: ApprovalLimit[];
}

interface PaymentTerm {
  id: number;
  name: string;
  days: number;
  description: string;
}

interface ApprovalLimit {
  id: number;
  role: string;
  limit: number;
  requiresDualApproval: boolean;
}

const AccountingSetup: React.FC = () => {
  const [settings, setSettings] = useState<AccountingSettings>({
    companyName: 'Cimmple Corp',
    fiscalYearStart: '01-01',
    defaultCurrency: 'USD',
    taxRate: 8.25,
    paymentTerms: [],
    approvalLimits: []
  });

  const [activeTab, setActiveTab] = useState<'general' | 'gl-defaults' | 'payment-terms' | 'approvals'>('general');
  const [saving, setSaving] = useState(false);
  const [coaAccounts, setCoaAccounts] = useState<ChartofAccountMaster[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccountingSettings();
    loadCoaAccounts();
  }, []);

  const loadCoaAccounts = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const accounts = await ChartofAccountsService.GetChartofAccounts({
        tenantid: storage?.tenantID || 0,
      });
      setCoaAccounts((accounts || []).filter((a) => a.isActive !== false));
    } catch (error) {
      console.error("Error loading chart of accounts:", error);
    }
  };

  const loadAccountingSettings = async () => {
    try {
      const settingsData = await AccountingService.GetAccountingSettings();
      if (settingsData) {
        setSettings({
          companyName: settingsData.companyName || 'Cimmple Corp',
          fiscalYearStart: settingsData.fiscalYearStart || '01-01',
          defaultCurrency: settingsData.defaultCurrency || 'USD',
          taxRate: settingsData.taxRate || 8.25,
          defaultAccountsReceivableAccountId: settingsData.defaultAccountsReceivableAccountId || undefined,
          defaultAccountsPayableAccountId: settingsData.defaultAccountsPayableAccountId || undefined,
          defaultRevenueAccountId: settingsData.defaultRevenueAccountId || undefined,
          defaultExpenseAccountId: settingsData.defaultExpenseAccountId || undefined,
          defaultInventoryAccountId: settingsData.defaultInventoryAccountId || undefined,
          defaultSalesTaxPayableAccountId: settingsData.defaultSalesTaxPayableAccountId || undefined,
          defaultInputTaxAccountId: settingsData.defaultInputTaxAccountId || undefined,
          defaultFreightOutAccountId: settingsData.defaultFreightOutAccountId || undefined,
          defaultOtherChargeAccountId: settingsData.defaultOtherChargeAccountId || undefined,
          defaultFreightInAccountId: settingsData.defaultFreightInAccountId || undefined,
          paymentTerms: settingsData.paymentTerms || [],
          approvalLimits: settingsData.approvalLimits || []
        });
      }
    } catch (error) {
      console.error('Error loading accounting settings:', error);
      toast.error('Failed to load accounting settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const settingsToSave = {
        companyName: settings.companyName,
        fiscalYearStart: settings.fiscalYearStart,
        defaultCurrency: settings.defaultCurrency,
        taxRate: settings.taxRate,
        defaultAccountsReceivableAccountId: settings.defaultAccountsReceivableAccountId || null,
        defaultAccountsPayableAccountId: settings.defaultAccountsPayableAccountId || null,
        defaultRevenueAccountId: settings.defaultRevenueAccountId || null,
        defaultExpenseAccountId: settings.defaultExpenseAccountId || null,
        defaultInventoryAccountId: settings.defaultInventoryAccountId || null,
        defaultSalesTaxPayableAccountId: settings.defaultSalesTaxPayableAccountId || null,
        defaultInputTaxAccountId: settings.defaultInputTaxAccountId || null,
        defaultFreightOutAccountId: settings.defaultFreightOutAccountId || null,
        defaultOtherChargeAccountId: settings.defaultOtherChargeAccountId || null,
        defaultFreightInAccountId: settings.defaultFreightInAccountId || null,
        paymentTerms: settings.paymentTerms,
        approvalLimits: settings.approvalLimits
      };

      await AccountingService.SaveAccountingSettings(settingsToSave);
      toast.success('Accounting settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof AccountingSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const updatePaymentTerm = (id: number, field: keyof PaymentTerm, value: any) => {
    setSettings(prev => ({
      ...prev,
      paymentTerms: prev.paymentTerms.map(term =>
        term.id === id ? { ...term, [field]: value } : term
      )
    }));
  };

  const updateApprovalLimit = (id: number, field: keyof ApprovalLimit, value: any) => {
    setSettings(prev => ({
      ...prev,
      approvalLimits: prev.approvalLimits.map(limit =>
        limit.id === id ? { ...limit, [field]: value } : limit
      )
    }));
  };

  const addPaymentTerm = () => {
    const newTerm: PaymentTerm = {
      id: Math.max(...settings.paymentTerms.map(t => t.id)) + 1,
      name: 'New Term',
      days: 30,
      description: 'New payment term'
    };
    setSettings(prev => ({
      ...prev,
      paymentTerms: [...prev.paymentTerms, newTerm]
    }));
  };

  const tabs = [
    { id: 'general', label: 'General Settings', icon: faCog },
    { id: 'gl-defaults', label: 'Default Accounts', icon: faBook },
    { id: 'payment-terms', label: 'Payment Terms', icon: faCalendar },
    { id: 'approvals', label: 'Approval Limits', icon: faCalculator }
  ];

  const renderAccountSelect = (
    label: string,
    field: keyof AccountingSettings,
    help: string
  ) => (
    <div>
      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
        {label}
      </label>
      <select
        value={(settings[field] as number | undefined) || ""}
        onChange={(e) =>
          updateSetting(
            field,
            e.target.value ? parseInt(e.target.value, 10) : undefined
          )
        }
        style={{
          width: '100%',
          padding: '0.75rem',
          border: '1px solid #d1d5db',
          borderRadius: '0.375rem',
          fontSize: '0.875rem'
        }}
      >
        <option value="">Not configured (legacy name match)</option>
        {coaAccounts.map((coa) => (
          <option key={`${String(field)}-${coa.accountID}`} value={coa.accountID}>
            {coa.accountCode} - {coa.accountName}
          </option>
        ))}
      </select>
      <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>{help}</p>
    </div>
  );

  if (loading) {
    return (
      <div style={{ padding: '1.5rem', width: '100%' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div>Loading accounting settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
              Accounting Setup
            </h1>
            <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
              Configure default GL accounts, payment terms, and approval workflows
            </p>
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={saving}
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
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                flex: 1,
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
                color: activeTab === tab.id ? '#3b82f6' : '#6b7280'
              }}
            >
              <FontAwesomeIcon icon={tab.icon} />
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '1.5rem' }}>
          {/* General Settings */}
          {activeTab === 'general' && (
            <div>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
                General Accounting Settings
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={settings.companyName}
                    onChange={(e) => updateSetting('companyName', e.target.value)}
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
                    Fiscal Year Start
                  </label>
                  <select
                    value={settings.fiscalYearStart}
                    onChange={(e) => updateSetting('fiscalYearStart', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value="01-01">January 1</option>
                    <option value="04-01">April 1</option>
                    <option value="07-01">July 1</option>
                    <option value="10-01">October 1</option>
                  </select>
                </div>

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
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                    Default Tax Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={settings.taxRate}
                    onChange={(e) => updateSetting('taxRate', parseFloat(e.target.value) || 0)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'gl-defaults' && (
            <div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
                Default GL Accounts
              </h3>
              <p style={{ margin: '0 0 1.5rem 0', color: '#6b7280', fontSize: '0.875rem' }}>
                These accounts are used when customer and vendor invoices auto-post to the general ledger.
                Vendor-specific AP/expense mappings override company defaults when set.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {renderAccountSelect(
                  'Accounts Receivable',
                  'defaultAccountsReceivableAccountId',
                  'Debited on customer invoices; credited on customer payments.'
                )}
                {renderAccountSelect(
                  'Accounts Payable',
                  'defaultAccountsPayableAccountId',
                  'Credited on vendor bills when the vendor has no AP mapping.'
                )}
                {renderAccountSelect(
                  'Revenue / Sales',
                  'defaultRevenueAccountId',
                  'Credited on customer invoices.'
                )}
                {renderAccountSelect(
                  'Expense',
                  'defaultExpenseAccountId',
                  'Debited on vendor bills when line GL code and vendor default expense are absent.'
                )}
                {renderAccountSelect(
                  'Inventory',
                  'defaultInventoryAccountId',
                  'Reserved for stocked purchase posting (next phase).'
                )}
                {renderAccountSelect(
                  'Sales Tax Payable',
                  'defaultSalesTaxPayableAccountId',
                  'Credited on customer invoices when sales tax is charged.'
                )}
                {renderAccountSelect(
                  'Input Tax Recoverable',
                  'defaultInputTaxAccountId',
                  'Debited on vendor bills when recoverable input tax is entered.'
                )}
                {renderAccountSelect(
                  'Freight Out / Shipping Income',
                  'defaultFreightOutAccountId',
                  'Credited on customer invoices when shipping/freight is billed.'
                )}
                {renderAccountSelect(
                  'Other Charge Income',
                  'defaultOtherChargeAccountId',
                  'Credited on customer invoices when other charges are billed.'
                )}
                {renderAccountSelect(
                  'Freight In',
                  'defaultFreightInAccountId',
                  'Debited on vendor bills when freight/shipping is charged.'
                )}
              </div>
            </div>
          )}

          {/* Payment Terms */}
          {activeTab === 'payment-terms' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
                  Payment Terms
                </h3>
                <button
                  onClick={addPaymentTerm}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
                >
                  Add Payment Term
                </button>
              </div>

              <div style={{ display: 'grid', gap: '1rem' }}>
                {settings.paymentTerms.map(term => (
                  <div key={term.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 3fr auto',
                    gap: '1rem',
                    alignItems: 'center',
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.375rem'
                  }}>
                    <input
                      type="text"
                      value={term.name}
                      onChange={(e) => updatePaymentTerm(term.id, 'name', e.target.value)}
                      placeholder="Term name"
                      style={{
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem'
                      }}
                    />
                    <input
                      type="number"
                      value={term.days}
                      onChange={(e) => updatePaymentTerm(term.id, 'days', parseInt(e.target.value) || 0)}
                      placeholder="Days"
                      style={{
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem'
                      }}
                    />
                    <input
                      type="text"
                      value={term.description}
                      onChange={(e) => updatePaymentTerm(term.id, 'description', e.target.value)}
                      placeholder="Description"
                      style={{
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem'
                      }}
                    />
                    <button
                      onClick={() => {
                        setSettings(prev => ({
                          ...prev,
                          paymentTerms: prev.paymentTerms.filter(t => t.id !== term.id)
                        }));
                      }}
                      style={{
                        padding: '0.5rem',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Approval Limits */}
          {activeTab === 'approvals' && (
            <div>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
                Approval Limits
              </h3>

              <div style={{ display: 'grid', gap: '1rem' }}>
                {settings.approvalLimits.map(limit => (
                  <div key={limit.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 2fr 1fr auto',
                    gap: '1rem',
                    alignItems: 'center',
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.375rem'
                  }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                        Role
                      </label>
                      <input
                        type="text"
                        value={limit.role}
                        onChange={(e) => updateApprovalLimit(limit.id, 'role', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                        Approval Limit
                      </label>
                      <input
                        type="number"
                        value={limit.limit}
                        onChange={(e) => updateApprovalLimit(limit.id, 'limit', parseFloat(e.target.value) || 0)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                        Dual Approval
                      </label>
                      <input
                        type="checkbox"
                        checked={limit.requiresDualApproval}
                        onChange={(e) => updateApprovalLimit(limit.id, 'requiresDualApproval', e.target.checked)}
                        style={{ width: '1rem', height: '1rem' }}
                      />
                    </div>
                    <button
                      onClick={() => {
                        setSettings(prev => ({
                          ...prev,
                          approvalLimits: prev.approvalLimits.filter(l => l.id !== limit.id)
                        }));
                      }}
                      style={{
                        padding: '0.5rem',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountingSetup;



















