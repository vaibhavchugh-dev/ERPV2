export interface ProcessTemplateRow {
  code: string;
  name: string;
  description: string;
  category: "Machining" | "Assembly" | "Inspection" | "Finishing" | "Outside" | "Other";
  outsideServices: "Yes" | "No";
  /** Starting default in minutes. Left null where turnaround is vendor or job dependent. */
  estimatedMinutes: number | null;
  /**
   * Workstation that normally runs this process. Must match a Workstation Master name,
   * so the Workstation Master template is generated from these values.
   * Blank for outside services and for operations that are not tied to one station.
   */
  defaultWorkstation: string;
}

/**
 * Standard process catalog for a mechanical manufacturing machine shop.
 * Ledger code and cost per hour are left blank in the generated CSV because they
 * depend on each shop's chart of accounts and rates.
 */
export const PROCESS_TEMPLATE_ROWS: ProcessTemplateRow[] = [
  // Stock preparation and turning
  { code: "SAW-01", name: "Saw Cutting", description: "Cut bar, tube, or plate stock to rough length", category: "Machining", outsideServices: "No", estimatedMinutes: 15, defaultWorkstation: "Horizontal Band Saw" },
  { code: "TURN-MAN", name: "Manual Turning", description: "Engine lathe turning, facing, and taper work", category: "Machining", outsideServices: "No", estimatedMinutes: 60, defaultWorkstation: "Manual Lathe" },
  { code: "TURN-CNC", name: "CNC Turning", description: "Two axis CNC lathe turning", category: "Machining", outsideServices: "No", estimatedMinutes: 45, defaultWorkstation: "CNC Lathe" },
  { code: "TURN-LIVE", name: "CNC Turn-Mill", description: "CNC lathe with live tooling and C axis", category: "Machining", outsideServices: "No", estimatedMinutes: 60, defaultWorkstation: "CNC Turn-Mill Center" },
  { code: "SWISS-01", name: "Swiss Screw Machining", description: "Sliding headstock machining of precision small parts", category: "Machining", outsideServices: "No", estimatedMinutes: 40, defaultWorkstation: "Swiss Screw Machine" },

  // Milling
  { code: "MILL-MAN", name: "Manual Milling", description: "Knee mill and bed mill operations", category: "Machining", outsideServices: "No", estimatedMinutes: 60, defaultWorkstation: "Manual Mill" },
  { code: "MILL-3AX", name: "CNC Milling - 3 Axis", description: "Vertical machining center, three axis", category: "Machining", outsideServices: "No", estimatedMinutes: 60, defaultWorkstation: "CNC Mill 3-Axis" },
  { code: "MILL-4AX", name: "CNC Milling - 4 Axis", description: "Vertical machining center with rotary fourth axis", category: "Machining", outsideServices: "No", estimatedMinutes: 75, defaultWorkstation: "CNC Mill 4-Axis" },
  { code: "MILL-5AX", name: "CNC Milling - 5 Axis", description: "Simultaneous five axis machining", category: "Machining", outsideServices: "No", estimatedMinutes: 90, defaultWorkstation: "CNC Mill 5-Axis" },
  { code: "MILL-HMC", name: "CNC Horizontal Milling", description: "Horizontal machining center with pallet changer", category: "Machining", outsideServices: "No", estimatedMinutes: 75, defaultWorkstation: "Horizontal Machining Center" },

  // Hole making
  { code: "DRILL-01", name: "Drilling", description: "Drill press and CNC hole drilling", category: "Machining", outsideServices: "No", estimatedMinutes: 20, defaultWorkstation: "Drill Press" },
  { code: "TAP-01", name: "Tapping", description: "Machine and hand tapping of threaded holes", category: "Machining", outsideServices: "No", estimatedMinutes: 15, defaultWorkstation: "Tapping Station" },
  { code: "REAM-01", name: "Reaming", description: "Finish sizing of holes to tolerance", category: "Machining", outsideServices: "No", estimatedMinutes: 15, defaultWorkstation: "Drill Press" },
  { code: "BORE-01", name: "Boring", description: "Precision boring of large diameter holes", category: "Machining", outsideServices: "No", estimatedMinutes: 45, defaultWorkstation: "Boring Mill" },
  { code: "CSK-01", name: "Countersink / Counterbore", description: "Fastener seat preparation", category: "Machining", outsideServices: "No", estimatedMinutes: 10, defaultWorkstation: "Drill Press" },
  { code: "THRD-MILL", name: "Thread Milling", description: "CNC thread milling of internal and external threads", category: "Machining", outsideServices: "No", estimatedMinutes: 20, defaultWorkstation: "CNC Mill 3-Axis" },

  // Specialty cutting
  { code: "KEY-01", name: "Keyseat / Slotting", description: "Keyway and slot cutting", category: "Machining", outsideServices: "No", estimatedMinutes: 25, defaultWorkstation: "Manual Mill" },
  { code: "BRCH-01", name: "Broaching", description: "Internal keyway and spline broaching", category: "Machining", outsideServices: "No", estimatedMinutes: 20, defaultWorkstation: "Broaching Press" },
  { code: "KNRL-01", name: "Knurling", description: "Diamond and straight knurl forming", category: "Machining", outsideServices: "No", estimatedMinutes: 10, defaultWorkstation: "Manual Lathe" },
  { code: "HOB-01", name: "Gear Hobbing", description: "Spur and helical gear tooth cutting", category: "Machining", outsideServices: "No", estimatedMinutes: 90, defaultWorkstation: "Gear Hobbing Machine" },
  { code: "GSHP-01", name: "Gear Shaping", description: "Internal gear and cluster gear cutting", category: "Machining", outsideServices: "No", estimatedMinutes: 90, defaultWorkstation: "Gear Shaper" },

  // Grinding and precision finishing
  { code: "GRND-SURF", name: "Surface Grinding", description: "Flat precision grinding", category: "Machining", outsideServices: "No", estimatedMinutes: 45, defaultWorkstation: "Surface Grinder" },
  { code: "GRND-CYL", name: "Cylindrical Grinding", description: "Outside diameter grinding between centers", category: "Machining", outsideServices: "No", estimatedMinutes: 60, defaultWorkstation: "Cylindrical Grinder" },
  { code: "GRND-ID", name: "Internal Grinding", description: "Bore grinding for size and finish", category: "Machining", outsideServices: "No", estimatedMinutes: 60, defaultWorkstation: "Internal Grinder" },
  { code: "GRND-CL", name: "Centerless Grinding", description: "High volume outside diameter grinding", category: "Machining", outsideServices: "No", estimatedMinutes: 30, defaultWorkstation: "Centerless Grinder" },
  { code: "GRND-TC", name: "Tool and Cutter Grinding", description: "Sharpening and form grinding of tooling", category: "Machining", outsideServices: "No", estimatedMinutes: 45, defaultWorkstation: "Tool and Cutter Grinder" },
  { code: "HONE-01", name: "Honing", description: "Bore finishing for size and surface finish", category: "Machining", outsideServices: "No", estimatedMinutes: 30, defaultWorkstation: "Honing Machine" },
  { code: "LAP-01", name: "Lapping", description: "Ultra fine flatness and surface finish work", category: "Machining", outsideServices: "No", estimatedMinutes: 30, defaultWorkstation: "Lapping Station" },

  // EDM
  { code: "EDM-WIRE", name: "Wire EDM", description: "Wire electrical discharge machining", category: "Machining", outsideServices: "No", estimatedMinutes: 90, defaultWorkstation: "Wire EDM" },
  { code: "EDM-SINK", name: "Sinker EDM", description: "Ram and plunge electrical discharge machining", category: "Machining", outsideServices: "No", estimatedMinutes: 120, defaultWorkstation: "Sinker EDM" },
  { code: "EDM-HOLE", name: "Small Hole EDM", description: "Start holes and deep small diameter holes", category: "Machining", outsideServices: "No", estimatedMinutes: 20, defaultWorkstation: "Small Hole EDM" },

  // Profile cutting and forming
  { code: "LASER-01", name: "Laser Cutting", description: "Sheet and plate profile cutting", category: "Machining", outsideServices: "No", estimatedMinutes: 20, defaultWorkstation: "Laser Cutter" },
  { code: "WJET-01", name: "Waterjet Cutting", description: "Abrasive waterjet profile cutting", category: "Machining", outsideServices: "No", estimatedMinutes: 30, defaultWorkstation: "Waterjet Cutter" },
  { code: "PLAS-01", name: "Plasma Cutting", description: "Plate profile cutting", category: "Machining", outsideServices: "No", estimatedMinutes: 20, defaultWorkstation: "Plasma Table" },
  { code: "PUNCH-01", name: "CNC Punching", description: "Turret punch sheet metal blanking", category: "Machining", outsideServices: "No", estimatedMinutes: 15, defaultWorkstation: "CNC Turret Punch" },
  { code: "BRAKE-01", name: "Press Brake Forming", description: "Sheet metal bending and forming", category: "Machining", outsideServices: "No", estimatedMinutes: 20, defaultWorkstation: "Press Brake" },
  { code: "ROLL-01", name: "Rolling and Bending", description: "Plate rolling and tube bending", category: "Machining", outsideServices: "No", estimatedMinutes: 25, defaultWorkstation: "Plate Roll" },

  // Joining and assembly
  { code: "WELD-MIG", name: "MIG Welding", description: "GMAW welding of steel fabrications", category: "Assembly", outsideServices: "No", estimatedMinutes: 30, defaultWorkstation: "MIG Welding Booth" },
  { code: "WELD-TIG", name: "TIG Welding", description: "GTAW welding of stainless and aluminum", category: "Assembly", outsideServices: "No", estimatedMinutes: 45, defaultWorkstation: "TIG Welding Booth" },
  { code: "WELD-SPOT", name: "Spot Welding", description: "Resistance spot welding of sheet assemblies", category: "Assembly", outsideServices: "No", estimatedMinutes: 10, defaultWorkstation: "Spot Welder" },
  { code: "BRAZE-01", name: "Brazing and Soldering", description: "Torch and furnace brazing", category: "Assembly", outsideServices: "No", estimatedMinutes: 30, defaultWorkstation: "Brazing Station" },
  { code: "ASSY-MECH", name: "Mechanical Assembly", description: "Final mechanical assembly and fastening", category: "Assembly", outsideServices: "No", estimatedMinutes: 60, defaultWorkstation: "Assembly Bench" },
  { code: "ASSY-SUB", name: "Sub-Assembly", description: "Build of sub-assemblies feeding final assembly", category: "Assembly", outsideServices: "No", estimatedMinutes: 45, defaultWorkstation: "Sub-Assembly Bench" },
  { code: "ASSY-PRESS", name: "Press Fit and Pinning", description: "Arbor press fits, bushings, and dowel pins", category: "Assembly", outsideServices: "No", estimatedMinutes: 15, defaultWorkstation: "Arbor Press Station" },
  { code: "ASSY-HW", name: "Hardware Insertion", description: "Self clinching and PEM hardware installation", category: "Assembly", outsideServices: "No", estimatedMinutes: 15, defaultWorkstation: "Hardware Insertion Press" },

  // In-house finishing
  { code: "DEBUR-01", name: "Deburring", description: "Manual edge break and burr removal", category: "Finishing", outsideServices: "No", estimatedMinutes: 15, defaultWorkstation: "Deburring Bench" },
  { code: "TUMB-01", name: "Tumbling and Vibratory Finishing", description: "Mass finishing in vibratory bowl", category: "Finishing", outsideServices: "No", estimatedMinutes: 60, defaultWorkstation: "Vibratory Tumbler" },
  { code: "BLAST-01", name: "Bead Blasting", description: "Glass bead and sand blast surface preparation", category: "Finishing", outsideServices: "No", estimatedMinutes: 20, defaultWorkstation: "Blast Cabinet" },
  { code: "POLSH-01", name: "Polishing and Buffing", description: "Mechanical polish to required finish", category: "Finishing", outsideServices: "No", estimatedMinutes: 30, defaultWorkstation: "Polishing Station" },
  { code: "GRAIN-01", name: "Graining and Brushing", description: "Directional brushed surface finish", category: "Finishing", outsideServices: "No", estimatedMinutes: 20, defaultWorkstation: "Polishing Station" },
  { code: "WASH-01", name: "Parts Washing", description: "Aqueous or ultrasonic cleaning and drying", category: "Finishing", outsideServices: "No", estimatedMinutes: 15, defaultWorkstation: "Parts Washer" },
  { code: "MARK-01", name: "Laser Marking and Engraving", description: "Part number, logo, and serial marking", category: "Finishing", outsideServices: "No", estimatedMinutes: 10, defaultWorkstation: "Laser Marker" },
  { code: "PAINT-01", name: "Wet Painting", description: "In-house primer and topcoat spray", category: "Finishing", outsideServices: "No", estimatedMinutes: 45, defaultWorkstation: "Paint Booth" },

  // Outside services
  { code: "HT-01", name: "Heat Treating", description: "Vendor harden and temper to specified hardness", category: "Outside", outsideServices: "Yes", estimatedMinutes: null, defaultWorkstation: "" },
  { code: "HT-SR", name: "Stress Relieving", description: "Stress relief after rough machining or welding", category: "Outside", outsideServices: "Yes", estimatedMinutes: null, defaultWorkstation: "" },
  { code: "HT-CASE", name: "Case Hardening", description: "Carburizing, nitriding, or induction hardening", category: "Outside", outsideServices: "Yes", estimatedMinutes: null, defaultWorkstation: "" },
  { code: "ANOD-01", name: "Anodizing", description: "Type II sulfuric anodize", category: "Outside", outsideServices: "Yes", estimatedMinutes: null, defaultWorkstation: "" },
  { code: "ANOD-HRD", name: "Hard Anodizing", description: "Type III hard coat anodize", category: "Outside", outsideServices: "Yes", estimatedMinutes: null, defaultWorkstation: "" },
  { code: "PLATE-ZN", name: "Zinc Plating", description: "Zinc plate with clear or yellow chromate", category: "Outside", outsideServices: "Yes", estimatedMinutes: null, defaultWorkstation: "" },
  { code: "PLATE-NI", name: "Nickel Plating", description: "Electroless and electrolytic nickel plating", category: "Outside", outsideServices: "Yes", estimatedMinutes: null, defaultWorkstation: "" },
  { code: "PLATE-CR", name: "Chrome Plating", description: "Hard chrome and decorative chrome plating", category: "Outside", outsideServices: "Yes", estimatedMinutes: null, defaultWorkstation: "" },
  { code: "PASS-01", name: "Passivation", description: "Stainless steel passivation per ASTM A967", category: "Outside", outsideServices: "Yes", estimatedMinutes: null, defaultWorkstation: "" },
  { code: "CHEM-01", name: "Chemical Film", description: "Chromate conversion coating such as Alodine", category: "Outside", outsideServices: "Yes", estimatedMinutes: null, defaultWorkstation: "" },
  { code: "BLKOX-01", name: "Black Oxide", description: "Black oxide corrosion resistant finish", category: "Outside", outsideServices: "Yes", estimatedMinutes: null, defaultWorkstation: "" },
  { code: "POWD-01", name: "Powder Coating", description: "Electrostatic powder coat and cure", category: "Outside", outsideServices: "Yes", estimatedMinutes: null, defaultWorkstation: "" },
  { code: "NDT-PT", name: "NDT - Dye Penetrant", description: "Liquid penetrant crack inspection", category: "Outside", outsideServices: "Yes", estimatedMinutes: null, defaultWorkstation: "" },
  { code: "NDT-MT", name: "NDT - Magnetic Particle", description: "Magnetic particle inspection of ferrous parts", category: "Outside", outsideServices: "Yes", estimatedMinutes: null, defaultWorkstation: "" },

  // Quality
  { code: "INSP-REC", name: "Receiving Inspection", description: "Incoming material and hardware verification", category: "Inspection", outsideServices: "No", estimatedMinutes: 20, defaultWorkstation: "Receiving Inspection Bench" },
  { code: "INSP-FA", name: "First Article Inspection", description: "Dimensional first article report", category: "Inspection", outsideServices: "No", estimatedMinutes: 90, defaultWorkstation: "Inspection Bench" },
  { code: "INSP-IP", name: "In-Process Inspection", description: "Operator and quality checks during production", category: "Inspection", outsideServices: "No", estimatedMinutes: 15, defaultWorkstation: "Inspection Bench" },
  { code: "INSP-CMM", name: "CMM Inspection", description: "Coordinate measuring machine inspection", category: "Inspection", outsideServices: "No", estimatedMinutes: 45, defaultWorkstation: "CMM" },
  { code: "INSP-FIN", name: "Final Inspection", description: "Final dimensional and visual inspection", category: "Inspection", outsideServices: "No", estimatedMinutes: 30, defaultWorkstation: "Inspection Bench" },
  { code: "TEST-FUNC", name: "Functional Testing", description: "Leak, pressure, or functional test", category: "Inspection", outsideServices: "No", estimatedMinutes: 30, defaultWorkstation: "Test Bench" },

  // Support operations
  { code: "ENG-CAM", name: "CAM Programming", description: "CNC program creation and proveout", category: "Other", outsideServices: "No", estimatedMinutes: 120, defaultWorkstation: "CAM Programming Station" },
  { code: "SETUP-01", name: "Machine Setup", description: "Fixture, tooling, and offset setup", category: "Other", outsideServices: "No", estimatedMinutes: 30, defaultWorkstation: "" },
  { code: "FIX-01", name: "Fixture Build", description: "Design and build of workholding", category: "Other", outsideServices: "No", estimatedMinutes: 240, defaultWorkstation: "Fixture Build Bench" },
  { code: "REWORK-01", name: "Rework", description: "Correction of nonconforming parts", category: "Other", outsideServices: "No", estimatedMinutes: 30, defaultWorkstation: "" },
  { code: "PKG-01", name: "Packaging", description: "Protective packing and labeling", category: "Other", outsideServices: "No", estimatedMinutes: 15, defaultWorkstation: "Packaging Station" },
  { code: "SHIP-01", name: "Shipping and Crating", description: "Crate build and shipment preparation", category: "Other", outsideServices: "No", estimatedMinutes: 20, defaultWorkstation: "Shipping Dock" },
];
