import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleQuestion, faTimes } from "@fortawesome/free-solid-svg-icons";
import "../../Common/Components/UserAccountModals.scss";

type HelpTab = "pay" | "import" | "manual";

type PayrollJournalsHelpProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

const TABS: { id: HelpTab; label: string }[] = [
  { id: "pay", label: "CimmplePay" },
  { id: "import", label: "Third-party" },
  { id: "manual", label: "Manual" },
];

const PayrollJournalsHelp: React.FC<PayrollJournalsHelpProps> = ({
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [tab, setTab] = useState<HelpTab>("pay");
  const controlled = openProp !== undefined;
  const open = controlled ? !!openProp : internalOpen;

  const setOpen = (next: boolean) => {
    if (!controlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          className="je-help-btn"
          title="Payroll setup help"
          aria-label="Payroll setup help"
          onClick={() => setOpen(true)}
        >
          <FontAwesomeIcon icon={faCircleQuestion} />
        </button>
      )}

      {open && (
        <div
          className="user-account-modal-overlay"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="user-account-modal payroll-help-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payroll-help-title"
          >
            <div className="user-account-modal-header">
              <h2 id="payroll-help-title">
                <FontAwesomeIcon icon={faCircleQuestion} />
                <span>Payroll journals setup</span>
              </h2>
              <button
                type="button"
                className="user-account-modal-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="user-account-modal-body">
              <p className="help-intro">
                First-time checklist so payroll posts into the books. Do the shared steps once,
                then follow the path that matches how this client runs payroll.
              </p>

              <h3 className="payroll-help-h">Once for every client</h3>
              <table className="shortcuts-table">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Who</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      Chart of accounts includes payroll accounts (wages, tax payables, accrued
                      payroll, employer tax expense, checking).
                    </td>
                    <td>Provider</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Accounting Setup → Payroll GL Accounts</strong> — map each bucket,
                      especially <strong>Net Pay / Accrued Payroll</strong>.
                    </td>
                    <td>Client</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Default Payroll Bank</strong> (or mark a bank in Bank Master as the
                      payroll default). Needed when cash actually leaves the bank.
                    </td>
                    <td>Client</td>
                  </tr>
                  <tr>
                    <td>
                      Accounting period for the pay date (and later payment date) is <strong>open</strong>.
                    </td>
                    <td>Client</td>
                  </tr>
                </tbody>
              </table>

              <div className="payroll-help-tabs" role="tablist">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    className={tab === t.id ? "is-active" : ""}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "pay" && (
                <div className="help-content" role="tabpanel">
                  <p className="help-intro">
                    Client uses CimmplePay to calculate and finalize. Pay pushes the accrual journal
                    here. Do not enter the same period again with Manual or Import.
                  </p>
                  <table className="shortcuts-table">
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Who</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          In <strong>CimmplePay → Company Setup</strong>, enable CimmpleFlow posting.
                          Set Flow tenant ID, location ID, and each payroll bucket to the Flow{" "}
                          <strong>Account ID</strong> (not the account code).
                        </td>
                        <td>Client or provider</td>
                      </tr>
                      <tr>
                        <td>
                          Provider configures Pay↔Flow server settings (API base URL and
                          shared integration client id/secret). Clients do not set this.
                        </td>
                        <td>Provider</td>
                      </tr>
                      <tr>
                        <td>
                          Finalize the pay run in Pay → open <strong>Accounting</strong> →{" "}
                          <strong>Post to CimmpleFlow</strong>. The row appears on this page as source
                          CimmplePay.
                        </td>
                        <td>Client</td>
                      </tr>
                      <tr>
                        <td>
                          After ACH or checks go out, use <strong>Post net pay</strong> (clears Accrued
                          Payroll, credits the payroll bank). When tax deposits are paid, use{" "}
                          <strong>Post tax remittance</strong>.
                        </td>
                        <td>Client</td>
                      </tr>
                      <tr>
                        <td>
                          Reopening a run in Pay clears Pay’s sync status only. Reverse the journal in
                          Flow if the books should change.
                        </td>
                        <td>Client</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {tab === "import" && (
                <div className="help-content" role="tabpanel">
                  <p className="help-intro">
                    Client uses ADP, Gusto, Paychex, or another provider. Flow does not calculate
                    taxes — it posts the totals they already ran.
                  </p>
                  <table className="shortcuts-table">
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Who</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          Complete the shared Accounting Setup steps above. No CimmplePay company
                          mapping is required.
                        </td>
                        <td>Client</td>
                      </tr>
                      <tr>
                        <td>
                          <strong>Import CSV</strong> — download the template, or upload the provider
                          file. Map columns (gross, taxes, deductions, net, employer taxes, pay date,
                          run id).
                        </td>
                        <td>Client</td>
                      </tr>
                      <tr>
                        <td>
                          Set <strong>Provider</strong> and a unique <strong>External run id</strong>{" "}
                          (provider batch id). Posting the same id again will not create a second
                          journal.
                        </td>
                        <td>Client</td>
                      </tr>
                      <tr>
                        <td>
                          Preview until balanced, then post. Source shows as Import. Then{" "}
                          <strong>Post net pay</strong> and, when deposits are paid,{" "}
                          <strong>Post tax remittance</strong>.
                        </td>
                        <td>Client</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {tab === "manual" && (
                <div className="help-content" role="tabpanel">
                  <p className="help-intro">
                    No payroll system — enter period totals. You do not need to know debit and credit
                    layout.
                  </p>
                  <table className="shortcuts-table">
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Who</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          Complete the shared Accounting Setup steps above so Flow knows which
                          accounts to use.
                        </td>
                        <td>Client</td>
                      </tr>
                      <tr>
                        <td>
                          <strong>+ Manual payroll</strong> — pay period, pay date, and amounts
                          (gross, withholdings, deductions, net, employer taxes). Use{" "}
                          <strong>Suggest net</strong> if net is gross minus withholdings.
                        </td>
                        <td>Client</td>
                      </tr>
                      <tr>
                        <td>
                          Preview until the journal is balanced, then post. Source shows as Manual.
                        </td>
                        <td>Client</td>
                      </tr>
                      <tr>
                        <td>
                          When wages are paid, <strong>Post net pay</strong>. When taxes are deposited,{" "}
                          <strong>Post tax remittance</strong>.
                        </td>
                        <td>Client</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              <ul className="help-tips">
                <li>
                  Accrual records the expense and liabilities. Net pay and tax remittance are separate
                  so bank reconciliation matches the real payment date.
                </li>
                <li>
                  If a post fails, check the open period, missing GL defaults, and (for Pay) that the
                  run is Finalized and already posted.
                </li>
                <li>
                  Press <kbd>Esc</kbd> to close this dialog.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PayrollJournalsHelp;
