import { PROCESS_TEMPLATE_ROWS } from "./ProcessMasterTemplateData";

export interface WorkstationTemplateRow {
  name: string;
  /** Processes from the Process Master template that run on this workstation. */
  processes: string[];
}

/**
 * Derived from the process catalog so every Default Workstation in the Process Master
 * template resolves to a real workstation once both templates are imported.
 * Order follows typical shop flow, matching the order of the process list.
 */
export const WORKSTATION_TEMPLATE_ROWS: WorkstationTemplateRow[] = (() => {
  const byName = new Map<string, WorkstationTemplateRow>();

  for (const process of PROCESS_TEMPLATE_ROWS) {
    const name = process.defaultWorkstation.trim();
    if (!name) continue;

    const existing = byName.get(name);
    if (existing) {
      existing.processes.push(process.name);
    } else {
      byName.set(name, { name, processes: [process.name] });
    }
  }

  return Array.from(byName.values());
})();
