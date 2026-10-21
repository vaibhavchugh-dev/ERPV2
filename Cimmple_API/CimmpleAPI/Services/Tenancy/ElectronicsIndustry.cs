namespace CimmpleAPI.Services.Tenancy
{
    /// <summary>
    /// Sample workstations, processes, and job templates for electrical and electronics
    /// component manufacturing. Workstation names are taken from the processes.
    /// </summary>
    public static class ElectronicsIndustry
    {
        public const string Code = "electronics";
        public const string Label = "Electrical and electronics";

        internal static readonly string[] Categories =
        {
            "SMT", "Through-hole", "Soldering", "Inspection", "Test", "Finishing", "Outside", "Other"
        };

        internal static readonly ProcessSeed[] Processes =
        {
            new("SMT-PRINT", "Solder Paste Printing", "Print solder paste through a stencil onto the bare board", "SMT", false, 10, "Stencil Printer"),
            new("SMT-SPI", "Solder Paste Inspection", "Check paste volume, height, and alignment", "SMT", false, 5, "Solder Paste Inspector"),
            new("SMT-PNP", "Pick and Place", "Place surface-mount components", "SMT", false, 20, "Pick and Place Machine"),
            new("SMT-REFLOW", "Reflow Soldering", "Reflow the board through a zoned oven", "SMT", false, 15, "Reflow Oven"),
            new("SMT-AOI", "Automated Optical Inspection", "Camera inspection of placed and soldered SMT parts", "Inspection", false, 10, "AOI Machine"),

            new("TH-INSERT", "Through-hole Insertion", "Insert axial, radial, and connector parts", "Through-hole", false, 20, "Through-hole Assembly Bench"),
            new("TH-WAVE", "Wave Soldering", "Wave solder the through-hole side", "Through-hole", false, 15, "Wave Solder Machine"),
            new("TH-SELECT", "Selective Soldering", "Solder selected through-hole joints", "Through-hole", false, 20, "Selective Solder Machine"),

            new("SOLD-HAND", "Hand Soldering", "Iron soldering of wires, connectors, and touch-up", "Soldering", false, 15, "Soldering Station"),
            new("SOLD-RWK", "Rework and Touch-up", "Remove and replace components and correct solder joints", "Soldering", false, 20, "Rework Station"),

            new("INSP-VIS", "Visual Inspection", "Manual inspection to the workmanship standard", "Inspection", false, 10, "Inspection Bench"),
            new("INSP-XRAY", "X-ray Inspection", "Inspect hidden joints such as BGAs and QFNs", "Inspection", false, 15, "X-ray Inspection System"),

            new("TEST-ICT", "In-circuit Test", "Fixture test of shorts, opens, and component values", "Test", false, 10, "ICT Fixture"),
            new("TEST-FUNC", "Functional Test", "Power-up and functional test of the assembly", "Test", false, 20, "Functional Test Bench"),
            new("TEST-BURN", "Burn-in", "Load boards into the burn-in chamber and record the result", "Test", false, 15, "Burn-in Chamber"),
            new("TEST-HIPOT", "Hi-Pot Test", "Dielectric withstand test", "Test", false, 10, "Hi-Pot Tester"),

            new("FIN-COAT", "Conformal Coating", "Apply conformal coating to the assembly", "Finishing", false, 15, "Conformal Coating Booth"),
            new("FIN-CURE", "Coating Cure", "Cure conformal coating", "Finishing", false, 20, "Curing Oven"),
            new("FIN-POT", "Potting and Encapsulation", "Pot or encapsulate a module or connector", "Finishing", false, 20, "Potting Station"),
            new("FIN-MARK", "Laser Marking", "Mark part number, revision, and serial number", "Finishing", false, 5, "Laser Marker"),
            new("FIN-DEPNL", "Depaneling", "Separate boards from the panel", "Finishing", false, 10, "PCB Depaneling Router"),

            new("OUT-PCBFAB", "PCB Fabrication", "Bare board fabricated by an outside shop", "Outside", true, null, ""),
            new("OUT-STENCIL", "Stencil Fabrication", "Solder paste stencil made outside", "Outside", true, null, ""),
            new("OUT-PCBA", "Outside PCB Assembly", "Board assembly sent to a contract manufacturer", "Outside", true, null, ""),
            new("OUT-CAL", "Calibration", "Instrument or board calibration by an outside lab", "Outside", true, null, ""),

            new("KIT-01", "Kitting", "Pull components for a work order", "Other", false, 15, "Kitting Bench"),
            new("CABLE-CUT", "Wire Cut and Strip", "Cut wire and cable to length and strip the ends", "Other", false, 10, "Wire Processing Machine"),
            new("CABLE-CRIMP", "Terminal Crimping", "Crimp terminals and contacts", "Other", false, 10, "Crimp Press"),
            new("CABLE-ASSY", "Cable Assembly", "Build harnesses, connectors, and cable assemblies", "Other", false, 30, "Cable Assembly Bench"),
            new("BOX-ASSY", "Box Build Assembly", "Assemble the board, wiring, and enclosure", "Other", false, 45, "Box Build Bench"),
            new("WASH-01", "Board Washing", "Wash flux residue and dry the assembly", "Other", false, 15, "Board Washer"),
            new("PKG-01", "Packaging", "Bag, label, and pack finished assemblies", "Other", false, 10, "Packaging Station"),
        };

        internal static readonly JobTemplateSeed[] JobTemplates =
        {
            new("SMT-BOARD", "SMT Assembly", "Print, place, reflow, and inspect a surface-mount board.",
                new[] { "SMT-PRINT", "SMT-SPI", "SMT-PNP", "SMT-REFLOW", "SMT-AOI", "INSP-VIS" }),
            new("TH-BOARD", "Through-hole Board", "Insert, wave solder, inspect, and functionally test a through-hole board.",
                new[] { "TH-INSERT", "TH-WAVE", "INSP-VIS", "TEST-FUNC" }),
            new("CABLE-HARN", "Cable Harness", "Cut, crimp, assemble, test, and pack a cable harness.",
                new[] { "CABLE-CUT", "CABLE-CRIMP", "CABLE-ASSY", "TEST-FUNC", "PKG-01" }),
            new("BOX-BUILD", "Box Build", "Kit, assemble the enclosure, test, mark, and pack a box build.",
                new[] { "KIT-01", "BOX-ASSY", "TEST-FUNC", "FIN-MARK", "PKG-01" }),
        };
    }
}
