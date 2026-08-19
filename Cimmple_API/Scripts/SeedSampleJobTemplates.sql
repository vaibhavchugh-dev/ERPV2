-- Sample job templates, operations and category tags for demo / verification.
--
-- Prerequisite: AddJobTemplateMaster.sql (or the EF migration 20260731085225_AddJobTemplateMaster)
-- must already have been applied.
--
-- Everything created here is IsSystem = 0, so every template, operation, tag and the
-- sample-only category values can be deleted from the UI. Run RemoveSampleJobTemplates.sql
-- to clear the whole set in one go.
--
-- Re-running is safe: templates are keyed on TemplateCode per tenant and are skipped if
-- they already exist. Child rows are only attached to templates created by this run.

USE CimmpleERPDB
GO

-- Required for inserts into the filtered unique indexes on TemplateCode and CategoryValue.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Guard and seed run in one batch so RETURN skips the rest when the tables are missing.
IF OBJECT_ID('CimmpleFlow.JobTemplateMaster', 'U') IS NULL
BEGIN
    RAISERROR('JobTemplateMaster does not exist. Run AddJobTemplateMaster.sql first.', 16, 1);
    RETURN;
END

-- Set to a tenant id to seed a single tenant, or leave NULL to seed every tenant that
-- already has Process Master data.
DECLARE @TenantFilter int = NULL;

-- =============================================
-- Sample data definitions
-- =============================================

DECLARE @Templates TABLE
(
    Code            nvarchar(50),
    Name            nvarchar(200),
    Descr           nvarchar(1000),
    Status          int,
    Revision        int,
    EffectiveFrom   datetime2,
    EffectiveTo     datetime2,
    ProcessName     nvarchar(100),
    WorkstationName nvarchar(200),
    SetupMin        decimal(18,2),
    CycleMin        decimal(18,2),
    LabourMin       decimal(18,2),
    MachineMin      decimal(18,2),
    Material        nvarchar(200),
    Grade           nvarchar(100),
    RawSize         nvarchar(100),
    MaterialNotes   nvarchar(1000),
    Tool            nvarchar(200),
    Fixture         nvarchar(200),
    Workholding     nvarchar(200),
    Gauge           nvarchar(200),
    ToolingNotes    nvarchar(1000),
    InspectionType  nvarchar(100),
    FirstArticle    bit,
    InProcess       bit,
    FinalInsp       bit,
    Cmm             bit,
    InspectionNotes nvarchar(1000)
);

-- Process and workstation names below are matched against Process Master and Workstation
-- Master by name, so they use the names already present in those masters.
INSERT INTO @Templates VALUES
('JT-1001', 'CNC Milling Aluminium Bracket',
 'Standard 3-axis milling routing for a machined aluminium mounting bracket, anodised finish.',
 1, 2, '2026-01-01', NULL,
 'CNC Milling - 3 Axis', 'CNC Mill 3-Axis',
 45.00, 12.50, 15.00, 12.50,
 'Aluminium 6061-T6', '6061-T6', '150 x 100 x 25 mm plate',
 'Check plate flatness before the first milling operation.',
 '12 mm carbide end mill', 'Soft jaw vise', '6 in machine vise', 'Digital calliper 0-150 mm',
 'Re-cut the soft jaws whenever the fixture is rebuilt.',
 'First Article', 1, 1, 1, 1,
 'First article to CMM. In-process check on hole positions every 10 parts.'),

('JT-1002', 'CNC Turning Steel Shaft',
 'Turning routing for a plain drive shaft with a ground journal and keyway.',
 1, 1, '2026-01-01', NULL,
 'CNC Turning', 'CNC Lathe',
 30.00, 8.75, 10.00, 8.75,
 'Steel EN8', 'EN8', '40 mm dia x 300 mm bar',
 'Bar stock is cut to length in the saw cell as the first operation.',
 'CNMG turning insert', '3-jaw chuck', 'Collet chuck', 'Micrometer 25-50 mm',
 'Replace the insert every 40 parts or on visible flank wear.',
 'In-Process', 1, 1, 1, 0,
 'Check the journal diameter after grinding on every part.'),

('JT-1003', 'Sheet Metal Enclosure Fabrication',
 'Laser, form, weld and assembly routing for a stainless steel electrical enclosure.',
 1, 1, '2026-01-01', NULL,
 'Press Brake Forming', 'Press Brake',
 60.00, 35.00, 40.00, 25.00,
 'Stainless Steel 304', '304', '2 mm sheet, 1250 x 2500',
 'Keep the protective film on until after weld dressing.',
 'Press brake V-die 12 mm', 'Weld table jig', 'Clamp set', 'Angle protractor',
 'Verify the bend allowance against the flat pattern before the first bend.',
 'Final', 1, 0, 1, 0,
 'Check door gap and squareness at final inspection.'),

('JT-1004', 'Precision Ground Hardened Pin',
 'Prototype routing for a hardened and ground location pin. Retired, kept for reference.',
 0, 3, '2026-01-01', '2026-06-30',
 'Cylindrical Grinding', 'Cylindrical Grinder',
 25.00, 6.00, 8.00, 6.00,
 'Tool Steel D2', 'D2 hardened 58-60 HRC', '20 mm dia x 120 mm bar',
 'Do not exceed 0.3 mm total stock removal after heat treatment.',
 'CBN grinding wheel', 'Between centres', 'Drive dog', 'Bore gauge and micrometer',
 'Dress the wheel between every batch.',
 'CMM', 1, 1, 1, 1,
 'Full CMM report required with each batch.'),

('JT-1005', 'Welded Steel Frame Assembly',
 'Cut, weld, coat and assemble routing for a mild steel box-section machine frame.',
 1, 1, '2026-01-01', NULL,
 'MIG Welding', 'MIG Welding Booth',
 90.00, 120.00, 150.00, 60.00,
 'Mild Steel Box Section', 'S355', '50 x 50 x 3 mm box section',
 'Check that mill certificates are on file before release.',
 'MIG torch 250 A', 'Frame welding jig', 'Toggle clamps', 'Tape measure and square',
 'Re-check jig alignment weekly.',
 'Final', 0, 1, 1, 0,
 'Measure diagonals after full weld. Tolerance 2 mm across the frame.');

DECLARE @Operations TABLE
(
    TemplateCode    nvarchar(50),
    Seq             int,
    ProcessName     nvarchar(100),
    WorkstationName nvarchar(200),
    SetupMin        decimal(18,2),
    CycleMin        decimal(18,2),
    Instructions    nvarchar(1000),
    IsMandatory     bit,
    QualityCheck    bit
);

INSERT INTO @Operations VALUES
('JT-1001', 10, 'Saw Cutting',              'Horizontal Band Saw', 10.00, 2.00, 'Cut the plate to a 155 x 105 mm blank.', 1, 0),
('JT-1001', 20, 'CNC Milling - 3 Axis',     'CNC Mill 3-Axis',     20.00, 4.50, 'Face the top surface and rough the outer profile leaving 0.5 mm.', 1, 0),
('JT-1001', 30, 'CNC Milling - 3 Axis',     'CNC Mill 3-Axis',     10.00, 4.00, 'Finish the outer profile and machine both pockets to depth.', 1, 1),
('JT-1001', 40, 'Drilling',                 'Drill Press',          5.00, 1.50, 'Drill the four 5.0 mm mounting holes.', 1, 0),
('JT-1001', 50, 'Tapping',                  'Tapping Station',      5.00, 1.00, 'Tap the four mounting holes to M6.', 1, 1),
('JT-1001', 60, 'Deburring',                'Deburring Bench',      2.00, 1.50, 'Deburr all edges and break sharp corners.', 1, 0),
('JT-1001', 70, 'Anodizing',                NULL,                   0.00, 0.00, 'Clear anodise to MIL-A-8625 Type II. Outside service.', 0, 0),
('JT-1001', 80, 'First Article Inspection', 'CMM',                 15.00, 8.00, 'Full first article report on the CMM.', 1, 1),

('JT-1002', 10, 'Saw Cutting',          'Horizontal Band Saw', 10.00, 1.50, 'Cut the bar to 305 mm.', 1, 0),
('JT-1002', 20, 'CNC Turning',          'CNC Lathe',           15.00, 3.00, 'Rough the outside diameter leaving 0.4 mm on the journal.', 1, 0),
('JT-1002', 30, 'CNC Turning',          'CNC Lathe',            5.00, 2.50, 'Finish turn the outside diameter and chamfer both ends.', 1, 1),
('JT-1002', 40, 'Drilling',             'CNC Lathe',            5.00, 1.75, 'Centre drill and bore the 10 mm through hole.', 1, 0),
('JT-1002', 50, 'Keyseat / Slotting',   'Manual Mill',         10.00, 4.00, 'Cut the 8 mm keyway to drawing.', 1, 0),
('JT-1002', 60, 'Cylindrical Grinding', 'Cylindrical Grinder', 10.00, 3.00, 'Grind the journal to 34.98 to 35.00 mm.', 1, 1),
('JT-1002', 70, 'Parts Washing',        'Parts Washer',         0.00, 1.00, 'Wash and oil ready for despatch.', 0, 0),
('JT-1002', 80, 'Final Inspection',     'Inspection Bench',     5.00, 3.00, 'Final dimensional check against the drawing.', 1, 1),

('JT-1003', 10, 'Laser Cutting',         'Laser Cutter',             15.00, 8.00, 'Cut the flat pattern including all cut-outs.', 1, 0),
('JT-1003', 20, 'Deburring',             'Deburring Bench',           2.00, 4.00, 'Deburr all laser-cut edges.', 1, 0),
('JT-1003', 30, 'Press Brake Forming',   'Press Brake',              25.00, 6.00, 'Form the four bends to the flat pattern.', 1, 1),
('JT-1003', 40, 'TIG Welding',           'TIG Welding Booth',        15.00, 10.00, 'Seam weld the four corners in the jig.', 1, 0),
('JT-1003', 50, 'Graining and Brushing', 'Polishing Station',         5.00, 6.00, 'Dress the welds and grain the exterior faces.', 1, 0),
('JT-1003', 60, 'Hardware Insertion',    'Hardware Insertion Press',  5.00, 3.00, 'Insert the PEM studs and standoffs.', 1, 0),
('JT-1003', 70, 'Mechanical Assembly',   'Assembly Bench',           10.00, 5.00, 'Fit the door, hinges and gasket.', 1, 1),
('JT-1003', 80, 'Final Inspection',      'Inspection Bench',          5.00, 4.00, 'Check the door gap and overall squareness.', 1, 1),

('JT-1004', 10, 'Saw Cutting',          'Horizontal Band Saw',  5.00, 1.00, 'Cut the bar to 125 mm.', 1, 0),
('JT-1004', 20, 'CNC Turning',          'CNC Lathe',           10.00, 2.00, 'Rough turn to pre-grind size leaving 0.3 mm.', 1, 0),
('JT-1004', 30, 'Heat Treating',        NULL,                   0.00, 0.00, 'Harden to 58-60 HRC. Outside service.', 1, 0),
('JT-1004', 40, 'Cylindrical Grinding', 'Cylindrical Grinder', 10.00, 2.50, 'Grind the outside diameter to nominal size.', 1, 1),
('JT-1004', 50, 'Lapping',              'Lapping Station',      3.00, 1.00, 'Lap to the required surface finish.', 0, 0),
('JT-1004', 60, 'CMM Inspection',       'CMM',                 10.00, 5.00, 'Full CMM report for the batch.', 1, 1),

('JT-1005', 10, 'Saw Cutting',         'Horizontal Band Saw', 20.00, 30.00, 'Cut all box section members to length.', 1, 0),
('JT-1005', 20, 'Drilling',            'Drill Press',         10.00, 12.00, 'Drill the fixing holes in the mounting faces.', 1, 0),
('JT-1005', 30, 'MIG Welding',         'MIG Welding Booth',   25.00, 25.00, 'Tack the frame together in the welding jig.', 1, 0),
('JT-1005', 40, 'MIG Welding',         'MIG Welding Booth',   10.00, 40.00, 'Full seam weld all joints. Check for distortion.', 1, 1),
('JT-1005', 50, 'Stress Relieving',    NULL,                   0.00, 0.00, 'Stress relieve to control distortion. Outside service.', 0, 0),
('JT-1005', 60, 'Deburring',           'Deburring Bench',      5.00, 15.00, 'Grind the welds flush and prepare the surface.', 1, 0),
('JT-1005', 70, 'Powder Coating',      'Paint Booth',         15.00, 20.00, 'Powder coat to RAL 7016 semi-gloss.', 1, 0),
('JT-1005', 80, 'Mechanical Assembly', 'Assembly Bench',      10.00, 10.00, 'Fit the mounting plates and levelling feet.', 1, 1);

DECLARE @Tags TABLE
(
    TemplateCode nvarchar(50),
    TypeName     nvarchar(100),
    ValueName    nvarchar(150)
);

INSERT INTO @Tags VALUES
('JT-1001', 'Process', 'Milling'),
('JT-1001', 'Material', 'Aluminium'),
('JT-1001', 'Part Family', 'Bracket'),
('JT-1001', 'Machine', 'Haas VF-2'),
('JT-1001', 'Customer', 'ABC Aerospace'),
('JT-1001', 'Production Type', 'Batch Production'),
('JT-1001', 'Inspection', 'First Article'),
('JT-1001', 'Complexity', 'Medium'),

('JT-1002', 'Process', 'Turning'),
('JT-1002', 'Process', 'Grinding'),
('JT-1002', 'Material', 'Steel'),
('JT-1002', 'Part Family', 'Shaft'),
('JT-1002', 'Machine', 'Mazak QT-200'),
('JT-1002', 'Customer', 'Delta Motors'),
('JT-1002', 'Production Type', 'Mass Production'),
('JT-1002', 'Inspection', 'In-Process'),
('JT-1002', 'Complexity', 'Low'),

('JT-1003', 'Process', 'Welding'),
('JT-1003', 'Process', 'Assembly'),
('JT-1003', 'Material', 'Stainless Steel'),
('JT-1003', 'Part Family', 'Enclosure'),
('JT-1003', 'Machine', 'Amada Press Brake'),
('JT-1003', 'Customer', 'Orion Industrial'),
('JT-1003', 'Production Type', 'Batch Production'),
('JT-1003', 'Inspection', 'Final'),
('JT-1003', 'Complexity', 'Medium'),

('JT-1004', 'Process', 'Grinding'),
('JT-1004', 'Material', 'Steel'),
('JT-1004', 'Part Family', 'Pin'),
('JT-1004', 'Machine', 'Studer S33'),
('JT-1004', 'Customer', 'ABC Aerospace'),
('JT-1004', 'Production Type', 'Prototype'),
('JT-1004', 'Inspection', 'CMM'),
('JT-1004', 'Complexity', 'High'),

('JT-1005', 'Process', 'Welding'),
('JT-1005', 'Material', 'Steel'),
('JT-1005', 'Part Family', 'Frame'),
('JT-1005', 'Machine', 'Miller MIG Station'),
('JT-1005', 'Customer', 'Delta Motors'),
('JT-1005', 'Production Type', 'Batch Production'),
('JT-1005', 'Inspection', 'Final'),
('JT-1005', 'Complexity', 'Medium');

-- =============================================
-- Tenants in scope
-- =============================================

DECLARE @Tenants TABLE (Tenantid int PRIMARY KEY);

INSERT INTO @Tenants (Tenantid)
SELECT DISTINCT Tenantid
FROM CimmpleFlow.ProcessMaster
WHERE @TenantFilter IS NULL OR Tenantid = @TenantFilter;

-- =============================================
-- Category types and values used by the samples
-- Values are IsSystem = 0 so an administrator can delete them again.
-- =============================================

DECLARE @NeededTypes TABLE (Name nvarchar(100), Code nvarchar(50), DisplayOrder int);
INSERT INTO @NeededTypes VALUES
    ('Process',         'PROCESS',     1),
    ('Material',        'MATERIAL',    2),
    ('Part Family',     'PARTFAMILY',  3),
    ('Machine',         'MACHINE',     4),
    ('Customer',        'CUSTOMER',    5),
    ('Production Type', 'PRODTYPE',    6),
    ('Inspection',      'INSPECTION',  7),
    ('Complexity',      'COMPLEXITY',  8);

INSERT INTO CimmpleFlow.CategoryType (Tenantid, Name, Code, DisplayOrder, AllowUserValues, IsSystem, IsActive)
SELECT t.Tenantid, d.Name, d.Code, d.DisplayOrder, 1, 1, 1
FROM @Tenants t
CROSS JOIN @NeededTypes d
WHERE NOT EXISTS (
    SELECT 1 FROM CimmpleFlow.CategoryType ct
    WHERE ct.Tenantid = t.Tenantid AND ct.Name = d.Name
);

INSERT INTO CimmpleFlow.CategoryValue (Tenantid, CategoryTypeId, Name, DisplayOrder, IsSystem, IsActive)
SELECT DISTINCT ct.Tenantid, ct.Id, g.ValueName, 0, 0, 1
FROM @Tenants t
INNER JOIN @Tags g ON 1 = 1
INNER JOIN CimmpleFlow.CategoryType ct ON ct.Tenantid = t.Tenantid AND ct.Name = g.TypeName
WHERE NOT EXISTS (
    SELECT 1 FROM CimmpleFlow.CategoryValue cv
    WHERE cv.CategoryTypeId = ct.Id AND cv.Name = g.ValueName
);

-- =============================================
-- Templates
-- PrimaryProcessId falls back to the tenant's first process so the "at least one process"
-- validation rule still holds when the sample process name is not in Process Master.
-- WorkstationId falls back to the tenant's first workstation, or stays NULL if none exist.
-- =============================================

DECLARE @New TABLE (Id int PRIMARY KEY, Tenantid int, Code nvarchar(50));

INSERT INTO CimmpleFlow.JobTemplateMaster
(
    Tenantid, TemplateCode, TemplateName, [Description], [Status], Revision,
    EffectiveFrom, EffectiveTo, PrimaryProcessId, WorkstationId,
    EstimatedSetupTimeMinutes, EstimatedCycleTimeMinutes,
    EstimatedLabourTimeMinutes, EstimatedMachineTimeMinutes,
    DefaultMaterial, MaterialGrade, RawMaterialSize, MaterialNotes,
    Tool, Fixture, Workholding, Gauge, ToolingNotes,
    InspectionType, FirstArticleRequired, InProcessInspection, FinalInspection,
    CmmRequired, InspectionNotes,
    IsSystem, CreatedDate, CreatedBy
)
OUTPUT inserted.Id, inserted.Tenantid, inserted.TemplateCode INTO @New (Id, Tenantid, Code)
SELECT
    t.Tenantid, s.Code, s.Name, s.Descr, s.Status, s.Revision,
    s.EffectiveFrom, s.EffectiveTo,
    COALESCE(pm.Id, fp.Id), COALESCE(ws.Id, fw.Id),
    s.SetupMin, s.CycleMin, s.LabourMin, s.MachineMin,
    s.Material, s.Grade, s.RawSize, s.MaterialNotes,
    s.Tool, s.Fixture, s.Workholding, s.Gauge, s.ToolingNotes,
    s.InspectionType, s.FirstArticle, s.InProcess, s.FinalInsp,
    s.Cmm, s.InspectionNotes,
    0,                  -- IsSystem: sample data must stay deletable
    SYSDATETIME(), NULL
FROM @Tenants t
CROSS JOIN @Templates s
OUTER APPLY (SELECT TOP 1 p.Id FROM CimmpleFlow.ProcessMaster p
             WHERE p.Tenantid = t.Tenantid AND p.ProcessName = s.ProcessName ORDER BY p.Id) pm
OUTER APPLY (SELECT TOP 1 p.Id FROM CimmpleFlow.ProcessMaster p
             WHERE p.Tenantid = t.Tenantid ORDER BY p.Id) fp
OUTER APPLY (SELECT TOP 1 w.Id FROM CimmpleFlow.WorkstationMaster w
             WHERE w.TenantId = t.Tenantid AND w.WorkstationName = s.WorkstationName ORDER BY w.Id) ws
OUTER APPLY (SELECT TOP 1 w.Id FROM CimmpleFlow.WorkstationMaster w
             WHERE w.TenantId = t.Tenantid ORDER BY w.Id) fw
WHERE NOT EXISTS (
    SELECT 1 FROM CimmpleFlow.JobTemplateMaster jt
    WHERE jt.Tenantid = t.Tenantid AND jt.TemplateCode = s.Code
);

-- =============================================
-- Operations and category tags for the templates created above
-- =============================================

INSERT INTO CimmpleFlow.JobTemplateOperation
(
    JobTemplateId, Tenantid, SequenceNumber, ProcessId, WorkstationId,
    SetupTimeMinutes, CycleTimeMinutes, Instructions, IsMandatory, QualityCheckRequired
)
-- The process falls back to the template's primary process so no operation is left without
-- one. The workstation does not fall back: outside-service steps are meant to have none.
SELECT
    n.Id, n.Tenantid, o.Seq,
    COALESCE(pm.Id, jt.PrimaryProcessId), ws.Id,
    o.SetupMin, o.CycleMin, o.Instructions, o.IsMandatory, o.QualityCheck
FROM @New n
INNER JOIN @Operations o ON o.TemplateCode = n.Code
INNER JOIN CimmpleFlow.JobTemplateMaster jt ON jt.Id = n.Id
OUTER APPLY (SELECT TOP 1 p.Id FROM CimmpleFlow.ProcessMaster p
             WHERE p.Tenantid = n.Tenantid AND p.ProcessName = o.ProcessName ORDER BY p.Id) pm
OUTER APPLY (SELECT TOP 1 w.Id FROM CimmpleFlow.WorkstationMaster w
             WHERE w.TenantId = n.Tenantid AND w.WorkstationName = o.WorkstationName ORDER BY w.Id) ws;

INSERT INTO CimmpleFlow.JobTemplateCategory (JobTemplateId, CategoryValueId, Tenantid)
SELECT DISTINCT n.Id, cv.Id, n.Tenantid
FROM @New n
INNER JOIN @Tags g ON g.TemplateCode = n.Code
INNER JOIN CimmpleFlow.CategoryType ct ON ct.Tenantid = n.Tenantid AND ct.Name = g.TypeName
INNER JOIN CimmpleFlow.CategoryValue cv ON cv.CategoryTypeId = ct.Id AND cv.Name = g.ValueName
WHERE NOT EXISTS (
    SELECT 1 FROM CimmpleFlow.JobTemplateCategory x
    WHERE x.JobTemplateId = n.Id AND x.CategoryValueId = cv.Id
);

SELECT
    (SELECT COUNT(*) FROM @New)                                              AS TemplatesCreated,
    (SELECT COUNT(*) FROM CimmpleFlow.JobTemplateOperation o
      WHERE o.JobTemplateId IN (SELECT Id FROM @New))                        AS OperationsCreated,
    (SELECT COUNT(*) FROM CimmpleFlow.JobTemplateCategory c
      WHERE c.JobTemplateId IN (SELECT Id FROM @New))                        AS CategoryTagsCreated;
GO
