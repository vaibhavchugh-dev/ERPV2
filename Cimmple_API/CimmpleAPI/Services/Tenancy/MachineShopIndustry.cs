namespace CimmpleAPI.Services.Tenancy
{
    internal readonly record struct ProcessSeed(
        string Code, string Name, string Description, string Category, bool Outside, int? Minutes, string Workstation);

    internal readonly record struct JobTemplateSeed(string Code, string Name, string Description, string[] ProcessCodes);

    /// <summary>Sample operational masters for a mechanical machine shop. Matches the Process Master CSV template.</summary>
    public static class MachineShopIndustry
    {
        public const string Code = "machine-shop";
        public const string Label = "Machine shop";

        internal static readonly string[] Categories =
            { "Machining", "Assembly", "Inspection", "Finishing", "Outside", "Other" };

        internal static readonly ProcessSeed[] Processes =
        {
            new("SAW-01", "Saw Cutting", "Cut bar, tube, or plate stock to rough length", "Machining", false, 15, "Horizontal Band Saw"),
            new("TURN-MAN", "Manual Turning", "Engine lathe turning, facing, and taper work", "Machining", false, 60, "Manual Lathe"),
            new("TURN-CNC", "CNC Turning", "Two axis CNC lathe turning", "Machining", false, 45, "CNC Lathe"),
            new("TURN-LIVE", "CNC Turn-Mill", "CNC lathe with live tooling and C axis", "Machining", false, 60, "CNC Turn-Mill Center"),
            new("SWISS-01", "Swiss Screw Machining", "Sliding headstock machining of precision small parts", "Machining", false, 40, "Swiss Screw Machine"),
            new("MILL-MAN", "Manual Milling", "Knee mill and bed mill operations", "Machining", false, 60, "Manual Mill"),
            new("MILL-3AX", "CNC Milling - 3 Axis", "Vertical machining center, three axis", "Machining", false, 60, "CNC Mill 3-Axis"),
            new("MILL-4AX", "CNC Milling - 4 Axis", "Vertical machining center with rotary fourth axis", "Machining", false, 75, "CNC Mill 4-Axis"),
            new("MILL-5AX", "CNC Milling - 5 Axis", "Simultaneous five axis machining", "Machining", false, 90, "CNC Mill 5-Axis"),
            new("MILL-HMC", "CNC Horizontal Milling", "Horizontal machining center with pallet changer", "Machining", false, 75, "Horizontal Machining Center"),
            new("DRILL-01", "Drilling", "Drill press and CNC hole drilling", "Machining", false, 20, "Drill Press"),
            new("TAP-01", "Tapping", "Machine and hand tapping of threaded holes", "Machining", false, 15, "Tapping Station"),
            new("REAM-01", "Reaming", "Finish sizing of holes to tolerance", "Machining", false, 15, "Drill Press"),
            new("BORE-01", "Boring", "Precision boring of large diameter holes", "Machining", false, 45, "Boring Mill"),
            new("CSK-01", "Countersink / Counterbore", "Fastener seat preparation", "Machining", false, 10, "Drill Press"),
            new("THRD-MILL", "Thread Milling", "CNC thread milling of internal and external threads", "Machining", false, 20, "CNC Mill 3-Axis"),
            new("KEY-01", "Keyseat / Slotting", "Keyway and slot cutting", "Machining", false, 25, "Manual Mill"),
            new("BRCH-01", "Broaching", "Internal keyway and spline broaching", "Machining", false, 20, "Broaching Press"),
            new("KNRL-01", "Knurling", "Diamond and straight knurl forming", "Machining", false, 10, "Manual Lathe"),
            new("HOB-01", "Gear Hobbing", "Spur and helical gear tooth cutting", "Machining", false, 90, "Gear Hobbing Machine"),
            new("GSHP-01", "Gear Shaping", "Internal gear and cluster gear cutting", "Machining", false, 90, "Gear Shaper"),
            new("GRND-SURF", "Surface Grinding", "Flat precision grinding", "Machining", false, 45, "Surface Grinder"),
            new("GRND-CYL", "Cylindrical Grinding", "Outside diameter grinding between centers", "Machining", false, 60, "Cylindrical Grinder"),
            new("GRND-ID", "Internal Grinding", "Bore grinding for size and finish", "Machining", false, 60, "Internal Grinder"),
            new("GRND-CL", "Centerless Grinding", "High volume outside diameter grinding", "Machining", false, 30, "Centerless Grinder"),
            new("GRND-TC", "Tool and Cutter Grinding", "Sharpening and form grinding of tooling", "Machining", false, 45, "Tool and Cutter Grinder"),
            new("HONE-01", "Honing", "Bore finishing for size and surface finish", "Machining", false, 30, "Honing Machine"),
            new("LAP-01", "Lapping", "Ultra fine flatness and surface finish work", "Machining", false, 30, "Lapping Station"),
            new("EDM-WIRE", "Wire EDM", "Wire electrical discharge machining", "Machining", false, 90, "Wire EDM"),
            new("EDM-SINK", "Sinker EDM", "Ram and plunge electrical discharge machining", "Machining", false, 120, "Sinker EDM"),
            new("EDM-HOLE", "Small Hole EDM", "Start holes and deep small diameter holes", "Machining", false, 20, "Small Hole EDM"),
            new("LASER-01", "Laser Cutting", "Sheet and plate profile cutting", "Machining", false, 20, "Laser Cutter"),
            new("WJET-01", "Waterjet Cutting", "Abrasive waterjet profile cutting", "Machining", false, 30, "Waterjet Cutter"),
            new("PLAS-01", "Plasma Cutting", "Plate profile cutting", "Machining", false, 20, "Plasma Table"),
            new("PUNCH-01", "CNC Punching", "Turret punch sheet metal blanking", "Machining", false, 15, "CNC Turret Punch"),
            new("BRAKE-01", "Press Brake Forming", "Sheet metal bending and forming", "Machining", false, 20, "Press Brake"),
            new("ROLL-01", "Rolling and Bending", "Plate rolling and tube bending", "Machining", false, 25, "Plate Roll"),
            new("WELD-MIG", "MIG Welding", "GMAW welding of steel fabrications", "Assembly", false, 30, "MIG Welding Booth"),
            new("WELD-TIG", "TIG Welding", "GTAW welding of stainless and aluminum", "Assembly", false, 45, "TIG Welding Booth"),
            new("WELD-SPOT", "Spot Welding", "Resistance spot welding of sheet assemblies", "Assembly", false, 10, "Spot Welder"),
            new("BRAZE-01", "Brazing and Soldering", "Torch and furnace brazing", "Assembly", false, 30, "Brazing Station"),
            new("ASSY-MECH", "Mechanical Assembly", "Final mechanical assembly and fastening", "Assembly", false, 60, "Assembly Bench"),
            new("ASSY-SUB", "Sub-Assembly", "Build of sub-assemblies feeding final assembly", "Assembly", false, 45, "Sub-Assembly Bench"),
            new("ASSY-PRESS", "Press Fit and Pinning", "Arbor press fits, bushings, and dowel pins", "Assembly", false, 15, "Arbor Press Station"),
            new("ASSY-HW", "Hardware Insertion", "Self clinching and PEM hardware installation", "Assembly", false, 15, "Hardware Insertion Press"),
            new("DEBUR-01", "Deburring", "Manual edge break and burr removal", "Finishing", false, 15, "Deburring Bench"),
            new("TUMB-01", "Tumbling and Vibratory Finishing", "Mass finishing in vibratory bowl", "Finishing", false, 60, "Vibratory Tumbler"),
            new("BLAST-01", "Bead Blasting", "Glass bead and sand blast surface preparation", "Finishing", false, 20, "Blast Cabinet"),
            new("POLSH-01", "Polishing and Buffing", "Mechanical polish to required finish", "Finishing", false, 30, "Polishing Station"),
            new("GRAIN-01", "Graining and Brushing", "Directional brushed surface finish", "Finishing", false, 20, "Polishing Station"),
            new("WASH-01", "Parts Washing", "Aqueous or ultrasonic cleaning and drying", "Finishing", false, 15, "Parts Washer"),
            new("MARK-01", "Laser Marking and Engraving", "Part number, logo, and serial marking", "Finishing", false, 10, "Laser Marker"),
            new("PAINT-01", "Wet Painting", "In-house primer and topcoat spray", "Finishing", false, 45, "Paint Booth"),
            new("HT-01", "Heat Treating", "Vendor harden and temper to specified hardness", "Outside", true, null, ""),
            new("HT-SR", "Stress Relieving", "Stress relief after rough machining or welding", "Outside", true, null, ""),
            new("HT-CASE", "Case Hardening", "Carburizing, nitriding, or induction hardening", "Outside", true, null, ""),
            new("ANOD-01", "Anodizing", "Type II sulfuric anodize", "Outside", true, null, ""),
            new("ANOD-HRD", "Hard Anodizing", "Type III hard coat anodize", "Outside", true, null, ""),
            new("PLATE-ZN", "Zinc Plating", "Zinc plate with clear or yellow chromate", "Outside", true, null, ""),
            new("PLATE-NI", "Nickel Plating", "Electroless and electrolytic nickel plating", "Outside", true, null, ""),
            new("PLATE-CR", "Chrome Plating", "Hard chrome and decorative chrome plating", "Outside", true, null, ""),
            new("PASS-01", "Passivation", "Stainless steel passivation per ASTM A967", "Outside", true, null, ""),
            new("CHEM-01", "Chemical Film", "Chromate conversion coating such as Alodine", "Outside", true, null, ""),
            new("BLKOX-01", "Black Oxide", "Black oxide corrosion resistant finish", "Outside", true, null, ""),
            new("POWD-01", "Powder Coating", "Electrostatic powder coat and cure", "Outside", true, null, ""),
            new("NDT-PT", "NDT - Dye Penetrant", "Liquid penetrant crack inspection", "Outside", true, null, ""),
            new("NDT-MT", "NDT - Magnetic Particle", "Magnetic particle inspection of ferrous parts", "Outside", true, null, ""),
            new("INSP-REC", "Receiving Inspection", "Incoming material and hardware verification", "Inspection", false, 20, "Receiving Inspection Bench"),
            new("INSP-FA", "First Article Inspection", "Dimensional first article report", "Inspection", false, 90, "Inspection Bench"),
            new("INSP-IP", "In-Process Inspection", "Operator and quality checks during production", "Inspection", false, 15, "Inspection Bench"),
            new("INSP-CMM", "CMM Inspection", "Coordinate measuring machine inspection", "Inspection", false, 45, "CMM"),
            new("INSP-FIN", "Final Inspection", "Final dimensional and visual inspection", "Inspection", false, 30, "Inspection Bench"),
            new("TEST-FUNC", "Functional Testing", "Leak, pressure, or functional test", "Inspection", false, 30, "Test Bench"),
            new("ENG-CAM", "CAM Programming", "CNC program creation and proveout", "Other", false, 120, "CAM Programming Station"),
            new("SETUP-01", "Machine Setup", "Fixture, tooling, and offset setup", "Other", false, 30, ""),
            new("FIX-01", "Fixture Build", "Design and build of workholding", "Other", false, 240, "Fixture Build Bench"),
            new("REWORK-01", "Rework", "Correction of nonconforming parts", "Other", false, 30, ""),
            new("PKG-01", "Packaging", "Protective packing and labeling", "Other", false, 15, "Packaging Station"),
            new("SHIP-01", "Shipping and Crating", "Crate build and shipment preparation", "Other", false, 20, "Shipping Dock"),
        };

        internal static readonly JobTemplateSeed[] JobTemplates =
        {
            new("TURNED-PIN", "Turned Pin", "Saw, turn, deburr, and inspect a simple turned part.",
                new[] { "SAW-01", "TURN-CNC", "DEBUR-01", "INSP-FIN" }),
            new("MILLED-BRACKET", "Milled Bracket", "Saw, mill, drill, tap, deburr, and inspect a bracket.",
                new[] { "SAW-01", "MILL-3AX", "DRILL-01", "TAP-01", "DEBUR-01", "INSP-FIN" }),
            new("WELDED-FRAME", "Welded Frame", "Saw, weld, grind, and inspect a fabricated frame.",
                new[] { "SAW-01", "WELD-MIG", "GRND-SURF", "INSP-FIN" }),
            new("SHEET-PANEL", "Sheet Metal Panel", "Laser cut, form, deburr, and inspect a sheet panel.",
                new[] { "LASER-01", "BRAKE-01", "DEBUR-01", "INSP-FIN" }),
        };

        internal static IReadOnlyList<string> WorkstationNames()
        {
            var names = new List<string>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var process in Processes)
            {
                if (string.IsNullOrWhiteSpace(process.Workstation)) continue;
                if (seen.Add(process.Workstation)) names.Add(process.Workstation);
            }
            return names;
        }
    }

    internal sealed class IndustrySample
    {
        public string Code { get; init; } = "";
        public string Label { get; init; } = "";
        public string[] Categories { get; init; } = Array.Empty<string>();
        public ProcessSeed[] Processes { get; init; } = Array.Empty<ProcessSeed>();
        public JobTemplateSeed[] JobTemplates { get; init; } = Array.Empty<JobTemplateSeed>();

        public IReadOnlyList<string> WorkstationNames()
        {
            var names = new List<string>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var process in Processes)
            {
                if (string.IsNullOrWhiteSpace(process.Workstation)) continue;
                if (seen.Add(process.Workstation)) names.Add(process.Workstation);
            }
            return names;
        }
    }

    public static class IndustryPacks
    {
        private static readonly IndustrySample[] Samples =
        {
            new()
            {
                Code = MachineShopIndustry.Code,
                Label = MachineShopIndustry.Label,
                Categories = MachineShopIndustry.Categories,
                Processes = MachineShopIndustry.Processes,
                JobTemplates = MachineShopIndustry.JobTemplates
            },
            new()
            {
                Code = ElectronicsIndustry.Code,
                Label = ElectronicsIndustry.Label,
                Categories = ElectronicsIndustry.Categories,
                Processes = ElectronicsIndustry.Processes,
                JobTemplates = ElectronicsIndustry.JobTemplates
            }
        };

        public static readonly IReadOnlyList<IndustryOption> All =
            Samples.Select(s => new IndustryOption(s.Code, s.Label)).ToList();

        public static bool IsKnown(string? code) => Normalize(code) != null;

        public static string? Normalize(string? code) =>
            Find(code)?.Code;

        /// <summary>Categories for the client's industry. Clients with no industry keep the machine-shop list.</summary>
        public static IReadOnlyList<string> CategoriesFor(string? industryCode) =>
            Find(industryCode)?.Categories ?? MachineShopIndustry.Categories;

        internal static IndustrySample? Find(string? code) =>
            Samples.FirstOrDefault(s => string.Equals(s.Code, code?.Trim(), StringComparison.OrdinalIgnoreCase));
    }

    public record IndustryOption(string Code, string Label);
}
