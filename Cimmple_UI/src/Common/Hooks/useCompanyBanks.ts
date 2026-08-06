import { useState, useEffect, useCallback } from "react";
import { BankService, BankMaster } from "../Services/BankService";

export function getBankDisplayName(bank: BankMaster): string {
  const name = bank.nickName || bank.bankName || "Bank";
  const account = bank.lastAccountNo || bank.accountNo;
  if (account) {
    const masked =
      account.length > 4 ? `••••${account.slice(-4)}` : account;
    return `${name} (${masked})`;
  }
  return name;
}

export function pickDefaultBankId(banks: BankMaster[]): number {
  if (!banks.length) return 0;
  const primary = banks.find((b) => b.isprimary);
  return primary?.id ?? banks[0].id;
}

/**
 * Loads company bank accounts from Bank Master for payment forms.
 * Defaults selection to the primary bank when available.
 */
export function useCompanyBanks() {
  const [banks, setBanks] = useState<BankMaster[]>([]);
  const [bankId, setBankId] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadBanks = useCallback(async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      // Payment forms need all company banks for the tenant — do not filter by
      // working location (that was emptying the dropdown when banks live on
      // another site). Bank Master / recon can still location-scope separately.
      const result = await BankService.GetBanklist({ tenantid: tenantID });
      const active = (result || []).filter(
        (b) => !b.status || b.status.toLowerCase() === "active"
      );
      const list = active.length ? active : result || [];
      setBanks(list);
      setBankId((current) => {
        if (current && list.some((b) => b.id === current)) return current;
        return pickDefaultBankId(list);
      });
    } catch (error) {
      console.error("Error loading company banks:", error);
      setBanks([]);
      setBankId(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBanks();
  }, [loadBanks]);

  return { banks, bankId, setBankId, loading, reload: loadBanks };
}
