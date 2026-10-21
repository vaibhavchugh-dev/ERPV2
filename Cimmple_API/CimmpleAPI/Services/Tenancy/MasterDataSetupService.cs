using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services.Tenancy
{
    /// <summary>
    /// Loads operational master data for a client: industry samples, or a CSV / Excel file the client provided.
    /// Workstations are applied before processes, and processes before job templates.
    /// Customers, vendors, and employees are not sampled.
    /// </summary>
    public class MasterDataSetupService
    {
        public const string Workstations = "workstations";
        public const string Processes = "processes";
        public const string JobTemplates = "jobTemplates";

        private static readonly string[] Order = { Workstations, Processes, JobTemplates };

        private readonly CimmpleDbContext _db;

        public MasterDataSetupService(CimmpleDbContext db) => _db = db;

        public static string? NormalizeMaster(string? name) =>
            Order.FirstOrDefault(m => string.Equals(m, name?.Trim(), StringComparison.OrdinalIgnoreCase));

        public static string SheetName(string master) => master switch
        {
            Workstations => "Workstations",
            Processes => "Processes",
            _ => "Job Templates"
        };

        public async Task<MasterSetupOverview?> GetOverviewAsync(int tenantId)
        {
            await TenantSchemaService.EnsureAsync(_db);
            var tenant = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.TenantId == tenantId);
            if (tenant == null) return null;

            var imports = await _db.TenantMasterImports.AsNoTracking()
                .Where(i => i.TenantId == tenantId)
                .OrderByDescending(i => i.CreatedUtc)
                .ToListAsync();

            MasterSetupCount Count(string master, int count) 
            {
                var last = imports.FirstOrDefault(i => i.MasterName == master);
                return new MasterSetupCount
                {
                    Master = master,
                    Count = count,
                    LastSource = last?.Source,
                    LastFileName = last?.FileName,
                    LastCreatedUtc = last?.CreatedUtc,
                    LastCreated = last?.CreatedCount ?? 0,
                    LastUpdated = last?.UpdatedCount ?? 0,
                    LastSkipped = last?.SkippedCount ?? 0,
                    LastFailed = last?.FailedCount ?? 0
                };
            }

            return new MasterSetupOverview
            {
                Industry = tenant.Industry,
                Workstations = Count(Workstations, await _db.WorkstationMaster.CountAsync(w => w.TenantId == tenantId)),
                Processes = Count(Processes, await _db.ProcessMaster.CountAsync(p => p.Tenantid == tenantId)),
                JobTemplates = Count(JobTemplates, await _db.JobTemplateMaster.CountAsync(t => t.Tenantid == tenantId))
            };
        }

        public async Task<(bool ok, string? error)> SetIndustryAsync(int tenantId, string? industry)
        {
            await TenantSchemaService.EnsureAsync(_db);
            var code = string.IsNullOrWhiteSpace(industry) ? null : IndustryPacks.Normalize(industry);
            if (!string.IsNullOrWhiteSpace(industry) && code == null)
                return (false, "Unknown industry.");

            var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.TenantId == tenantId);
            if (tenant == null) return (false, "Client not found.");
            tenant.Industry = code;
            await _db.SaveChangesAsync();
            return (true, null);
        }

        public Task<MasterApplyBatch> ApplySamplesAsync(int tenantId, string industry, IEnumerable<string> masters, string createdBy) =>
            ApplyAsync(tenantId, industry, NormalizeList(masters), createdBy, source: "Sample", fileName: null, rowsByMaster: null, commit: true);

        public async Task<MasterImportResult> ImportFileAsync(int tenantId, string master, Stream stream, string fileName, string createdBy, bool commit)
        {
            var key = NormalizeMaster(master) ?? throw new InvalidOperationException("Unknown master.");
            using var buffer = new MemoryStream();
            await stream.CopyToAsync(buffer);
            buffer.Position = 0;
            var rows = TabularFileParser.Parse(buffer, fileName, SheetName(key));
            var batch = await ApplyAsync(tenantId, industry: null, new[] { key }, createdBy, "File", fileName,
                new Dictionary<string, List<TabularRow>> { [key] = rows }, commit);
            return batch.Results.FirstOrDefault() ?? MasterImportResult.Fail(key, batch.Error ?? "Nothing to import.");
        }

        public async Task<MasterApplyBatch> ImportWorkbookAsync(int tenantId, Stream stream, string fileName, string createdBy, bool commit)
        {
            using var buffer = new MemoryStream();
            await stream.CopyToAsync(buffer);
            var bytes = buffer.ToArray();
            var rowsByMaster = new Dictionary<string, List<TabularRow>>();
            foreach (var master in Order)
            {
                using var probe = new MemoryStream(bytes);
                if (!TabularFileParser.HasSheet(probe, SheetName(master))) continue;
                using var read = new MemoryStream(bytes);
                rowsByMaster[master] = TabularFileParser.Parse(read, fileName, SheetName(master));
            }
            if (rowsByMaster.Count == 0)
                return MasterApplyBatch.Fail("No sheets named Workstations, Processes, or Job Templates were found.");

            return await ApplyAsync(tenantId, null, rowsByMaster.Keys, createdBy, "File", fileName, rowsByMaster, commit);
        }

        public static string TemplateCsv(string master)
        {
            var key = NormalizeMaster(master) ?? throw new InvalidOperationException("Unknown master.");
            return key switch
            {
                Workstations => "Workstation Name,Status\nCNC Lathe,Active\n",
                Processes => "Process Code,Process Name,Description,Category,Outside Services,Estimated Minutes,Default Workstation,Status\nTURN-CNC,CNC Turning,Two axis CNC lathe turning,Machining,No,45,CNC Lathe,Active\n",
                _ => "Template Code,Template Name,Description,Sequence,Process Code,Workstation Name,Setup Minutes,Cycle Minutes,Instructions\nTURNED-PIN,Turned Pin,Saw then turn,1,SAW-01,Horizontal Band Saw,15,15,Cut to length\n"
            };
        }

        private async Task<MasterApplyBatch> ApplyAsync(
            int tenantId,
            string? industry,
            IEnumerable<string> masters,
            string createdBy,
            string source,
            string? fileName,
            Dictionary<string, List<TabularRow>>? rowsByMaster,
            bool commit)
        {
            await TenantSchemaService.EnsureAsync(_db);
            var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.TenantId == tenantId);
            if (tenant == null) return MasterApplyBatch.Fail("Client not found.");

            var selected = NormalizeList(masters);
            if (selected.Count == 0) return MasterApplyBatch.Fail("Choose at least one master.");

            IndustrySample? sample = null;
            if (source == "Sample")
            {
                sample = IndustryPacks.Find(IndustryPacks.Normalize(industry) ?? tenant.Industry);
                if (sample == null) return MasterApplyBatch.Fail("Choose an industry before loading sample data.");
                if (!string.Equals(tenant.Industry, sample.Code, StringComparison.OrdinalIgnoreCase))
                {
                    tenant.Industry = sample.Code;
                    await _db.SaveChangesAsync();
                }
            }

            var batch = new MasterApplyBatch();
            foreach (var master in Order.Where(selected.Contains))
            {
                List<TabularRow>? rows = null;
                rowsByMaster?.TryGetValue(master, out rows);
                var result = await RunMasterAsync(tenantId, master, rows, source, fileName, createdBy, commit, sample);
                batch.Results.Add(result);
            }

            batch.Success = batch.Results.All(r => r.Failed == 0);
            if (!batch.Success)
                batch.Error = string.Join(" ", batch.Results.Where(r => r.Failed > 0).Select(r => $"{Label(r.Master)}: {r.Failed} row(s) failed."));
            return batch;
        }

        private async Task<MasterImportResult> RunMasterAsync(
            int tenantId, string master, List<TabularRow>? fileRows, string source, string? fileName, string createdBy, bool commit, IndustrySample? sample)
        {
            await using var tx = await _db.Database.BeginTransactionAsync();
            MasterImportResult result;
            try
            {
                result = master switch
                {
                    Workstations => ImportWorkstations(tenantId, source == "Sample" ? null : fileRows, updateExisting: source != "Sample", sample),
                    Processes => ImportProcesses(tenantId, source == "Sample" ? null : fileRows, updateExisting: source != "Sample", sample),
                    _ => ImportJobTemplates(tenantId, source == "Sample" ? null : fileRows, sample)
                };
            }
            catch
            {
                await tx.RollbackAsync();
                _db.ChangeTracker.Clear();
                throw;
            }

            if (!commit)
            {
                await tx.RollbackAsync();
                _db.ChangeTracker.Clear();
                return result;
            }

            _db.TenantMasterImports.Add(new TenantMasterImport
            {
                TenantId = tenantId,
                MasterName = master,
                Source = source,
                FileName = fileName,
                CreatedCount = result.Created,
                UpdatedCount = result.Updated,
                SkippedCount = result.Skipped,
                FailedCount = result.Failed,
                CreatedBy = createdBy,
                CreatedUtc = DateTime.UtcNow
            });
            await _db.SaveChangesAsync();
            await tx.CommitAsync();
            return result;
        }

        private MasterImportResult ImportWorkstations(int tenantId, List<TabularRow>? fileRows, bool updateExisting, IndustrySample? sample)
        {
            var result = new MasterImportResult { Master = Workstations };
            var incoming = fileRows == null
                ? (sample ?? throw new InvalidOperationException("Choose an industry before loading sample data.")).WorkstationNames().Select((name, i) => (Row: i + 2, Name: name, Status: "Active")).ToList()
                : fileRows.Select(r => (Row: r.RowNumber, Name: TabularFileParser.Cell(r, "Workstation Name", "Name", "Workstation"), Status: TabularFileParser.Cell(r, "Status"))).ToList();

            var existing = _db.WorkstationMaster.Where(w => w.TenantId == tenantId).ToList();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var row in incoming)
            {
                var name = row.Name.Trim();
                if (name.Length == 0)
                {
                    Fail(result, row.Row, "Workstation Name is required");
                    continue;
                }
                if (!seen.Add(name))
                {
                    Fail(result, row.Row, $"Duplicate Workstation Name '{name}' in the file");
                    continue;
                }

                var active = ParseActive(row.Status);
                var match = existing.FirstOrDefault(w => string.Equals(w.WorkstationName, name, StringComparison.OrdinalIgnoreCase));
                if (match != null)
                {
                    if (!updateExisting)
                    {
                        Skip(result, row.Row, "Workstation already exists");
                        continue;
                    }
                    if (match.IsActive && active == false)
                    {
                        Fail(result, row.Row, "Deactivate this workstation from Workstation Master. It may still be in use.");
                        continue;
                    }
                    match.WorkstationName = name;
                    if (active.HasValue) match.IsActive = active.Value;
                    result.Updated++;
                    continue;
                }

                _db.WorkstationMaster.Add(new WorkstationMaster
                {
                    TenantId = tenantId,
                    WorkstationName = name,
                    IsActive = active ?? true
                });
                result.Created++;
            }

            _db.SaveChanges();
            return result;
        }

        private MasterImportResult ImportProcesses(int tenantId, List<TabularRow>? fileRows, bool updateExisting, IndustrySample? sample)
        {
            var result = new MasterImportResult { Master = Processes };
            var pack = fileRows == null
                ? sample ?? throw new InvalidOperationException("Choose an industry before loading sample data.")
                : null;
            var incoming = pack != null
                ? pack.Processes.Select((p, i) => new ProcessIncoming(i + 2, p.Code, p.Name, p.Description, p.Category, p.Outside ? "Yes" : "No", p.Minutes?.ToString(), p.Workstation, "Active", "", "")).ToList()
                : fileRows.Select(r => new ProcessIncoming(
                    r.RowNumber,
                    TabularFileParser.Cell(r, "Process Code", "Code"),
                    TabularFileParser.Cell(r, "Process Name", "Name"),
                    TabularFileParser.Cell(r, "Description"),
                    TabularFileParser.Cell(r, "Category", "Process Category"),
                    TabularFileParser.Cell(r, "Outside Services", "Outside"),
                    TabularFileParser.Cell(r, "Estimated Minutes", "Default Estimated Time Minutes", "Minutes"),
                    TabularFileParser.Cell(r, "Default Workstation", "Workstation", "Workstation Name"),
                    TabularFileParser.Cell(r, "Status"),
                    TabularFileParser.Cell(r, "Ledger Code"),
                    TabularFileParser.Cell(r, "Cost Per Hour", "Standard Cost Per Hour"))).ToList();

            var existing = _db.ProcessMaster.Where(p => p.Tenantid == tenantId).ToList();
            var workstations = _db.WorkstationMaster.Where(w => w.TenantId == tenantId).ToList();
            var maxSrno = existing.Count == 0 ? 0 : existing.Max(p => p.Srno);
            var batchNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var batchCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var row in incoming)
            {
                var name = row.Name.Trim();
                var code = row.Code.Trim();
                if (name.Length == 0)
                {
                    Fail(result, row.Row, "Process Name is required");
                    continue;
                }
                if (code.Length > 0 && !batchCodes.Add(code))
                {
                    Fail(result, row.Row, $"Duplicate Process Code '{code}' in the file");
                    continue;
                }
                if (!batchNames.Add(name))
                {
                    Fail(result, row.Row, $"Duplicate Process Name '{name}' in the file");
                    continue;
                }

                ProcessMaster? match = null;
                if (code.Length > 0)
                    match = existing.FirstOrDefault(p => string.Equals(p.ProcessCode, code, StringComparison.OrdinalIgnoreCase));
                match ??= existing.FirstOrDefault(p => string.Equals(p.ProcessName, name, StringComparison.OrdinalIgnoreCase));

                if (existing.Any(p => (match == null || p.Id != match.Id) && string.Equals(p.ProcessName, name, StringComparison.OrdinalIgnoreCase)))
                {
                    Fail(result, row.Row, $"Process Name '{name}' already exists");
                    continue;
                }
                if (code.Length > 0 && existing.Any(p => (match == null || p.Id != match.Id) && string.Equals(p.ProcessCode, code, StringComparison.OrdinalIgnoreCase)))
                {
                    Fail(result, row.Row, $"Process Code '{code}' already exists");
                    continue;
                }

                int? workstationId = null;
                if (row.Workstation.Trim().Length > 0)
                {
                    var ws = workstations.FirstOrDefault(w => w.IsActive && string.Equals(w.WorkstationName, row.Workstation.Trim(), StringComparison.OrdinalIgnoreCase));
                    if (ws == null)
                        Warn(result, row.Row, $"Workstation '{row.Workstation.Trim()}' was not found. The default workstation was left blank.");
                    else
                        workstationId = ws.Id;
                }

                var outside = ParseYesNo(row.Outside);
                var status = ParseProcessStatus(row.Status);
                var minutes = TabularFileParser.Int(row.Minutes);
                var cost = TabularFileParser.Decimal(row.Cost);
                var category = row.Category.Trim();

                if (match != null)
                {
                    if (!updateExisting)
                    {
                        Skip(result, row.Row, "Process already exists");
                        continue;
                    }
                    var newStatus = status ?? match.status;
                    if (match.status == 1 && newStatus == 0)
                    {
                        Fail(result, row.Row, "Deactivate this process from Process Master. It may still be in use.");
                        continue;
                    }
                    if (code.Length > 0) match.ProcessCode = code;
                    match.ProcessName = name;
                    if (row.Description.Trim().Length > 0) match.PDescription = row.Description.Trim();
                    if (row.Ledger.Trim().Length > 0) match.ledgercode = row.Ledger.Trim();
                    if (category.Length > 0) match.ProcessCategory = category;
                    if (outside.HasValue) match.isFixed = outside;
                    match.status = newStatus;
                    if (minutes.HasValue) match.DefaultEstimatedTimeMinutes = minutes;
                    if (workstationId.HasValue) match.DefaultWorkstationId = workstationId;
                    if (cost.HasValue) match.StandardCostPerHour = cost;
                    result.Updated++;
                    continue;
                }

                maxSrno++;
                var created = new ProcessMaster
                {
                    Tenantid = tenantId,
                    ProcessCode = code,
                    ProcessName = name,
                    PDescription = row.Description.Trim(),
                    ledgercode = row.Ledger.Trim(),
                    ProcessCategory = category,
                    isFixed = outside ?? 0,
                    status = status ?? 1,
                    DefaultEstimatedTimeMinutes = minutes,
                    DefaultWorkstationId = workstationId,
                    StandardCostPerHour = cost,
                    Srno = maxSrno
                };
                _db.ProcessMaster.Add(created);
                existing.Add(created);
                result.Created++;
            }

            _db.SaveChanges();
            return result;
        }

        private MasterImportResult ImportJobTemplates(int tenantId, List<TabularRow>? fileRows, IndustrySample? sample)
        {
            var result = new MasterImportResult { Master = JobTemplates };
            var groups = new Dictionary<string, List<JobOpIncoming>>(StringComparer.OrdinalIgnoreCase);

            if (fileRows == null)
            {
                var pack = sample ?? throw new InvalidOperationException("Choose an industry before loading sample data.");
                var line = 2;
                foreach (var template in pack.JobTemplates)
                {
                    var ops = new List<JobOpIncoming>();
                    var seq = 1;
                    foreach (var code in template.ProcessCodes)
                    {
                        var process = pack.Processes.First(p => p.Code == code);
                        ops.Add(new JobOpIncoming(line++, template.Code, template.Name, template.Description, seq++, code, process.Workstation, 15, process.Minutes, ""));
                    }
                    groups[template.Code] = ops;
                }
            }
            else
            {
                foreach (var row in fileRows)
                {
                    var code = TabularFileParser.Cell(row, "Template Code", "Code");
                    if (code.Length == 0)
                    {
                        Fail(result, row.RowNumber, "Template Code is required");
                        continue;
                    }
                    if (!groups.TryGetValue(code, out var list))
                    {
                        list = new List<JobOpIncoming>();
                        groups[code] = list;
                    }
                    list.Add(new JobOpIncoming(
                        row.RowNumber,
                        code,
                        TabularFileParser.Cell(row, "Template Name", "Name"),
                        TabularFileParser.Cell(row, "Description"),
                        TabularFileParser.Int(TabularFileParser.Cell(row, "Sequence", "Seq")),
                        TabularFileParser.Cell(row, "Process Code"),
                        TabularFileParser.Cell(row, "Workstation Name", "Workstation", "Default Workstation"),
                        TabularFileParser.Decimal(TabularFileParser.Cell(row, "Setup Minutes", "Setup")),
                        TabularFileParser.Int(TabularFileParser.Cell(row, "Cycle Minutes", "Cycle")),
                        TabularFileParser.Cell(row, "Instructions")));
                }
            }

            var existing = _db.JobTemplateMaster.Where(t => t.Tenantid == tenantId).ToList();
            var processes = _db.ProcessMaster.Where(p => p.Tenantid == tenantId).ToList();
            var workstations = _db.WorkstationMaster.Where(w => w.TenantId == tenantId && w.IsActive).ToList();

            foreach (var group in groups)
            {
                var ops = group.Value;
                if (existing.Any(t => string.Equals(t.TemplateCode, group.Key, StringComparison.OrdinalIgnoreCase)))
                {
                    foreach (var op in ops) Skip(result, op.Row, "Job template already exists");
                    continue;
                }

                var name = ops.Select(o => o.Name).FirstOrDefault(n => n.Length > 0) ?? "";
                if (name.Length == 0)
                {
                    foreach (var op in ops) Fail(result, op.Row, "Template Name is required");
                    continue;
                }

                var resolved = new List<(JobOpIncoming Op, int ProcessId, int? WorkstationId)>();
                var groupFailed = false;
                foreach (var op in ops)
                {
                    if (op.ProcessCode.Length == 0)
                    {
                        Fail(result, op.Row, "Process Code is required");
                        groupFailed = true;
                        continue;
                    }
                    var process = processes.FirstOrDefault(p => string.Equals(p.ProcessCode, op.ProcessCode, StringComparison.OrdinalIgnoreCase));
                    if (process == null)
                    {
                        Fail(result, op.Row, $"Process Code '{op.ProcessCode}' was not found. Import processes first.");
                        groupFailed = true;
                        continue;
                    }
                    int? workstationId = null;
                    if (op.Workstation.Length > 0)
                    {
                        var ws = workstations.FirstOrDefault(w => string.Equals(w.WorkstationName, op.Workstation, StringComparison.OrdinalIgnoreCase));
                        if (ws == null)
                            Warn(result, op.Row, $"Workstation '{op.Workstation}' was not found. The operation was saved without a workstation.");
                        else
                            workstationId = ws.Id;
                    }
                    resolved.Add((op, process.Id, workstationId));
                }

                if (groupFailed || resolved.Count == 0)
                {
                    if (!groupFailed)
                        foreach (var op in ops) Fail(result, op.Row, "Template has no operations");
                    else
                        foreach (var item in resolved)
                            Fail(result, item.Op.Row, "Template was not created because another row in it failed.");
                    continue;
                }

                var description = ops.Select(o => o.Description).FirstOrDefault(d => d.Length > 0) ?? "";
                var template = new JobTemplateMaster
                {
                    Tenantid = tenantId,
                    TemplateCode = group.Key.Trim(),
                    TemplateName = name,
                    Description = description,
                    Status = 1,
                    Revision = 1,
                    PrimaryProcessId = resolved[0].ProcessId,
                    WorkstationId = resolved[0].WorkstationId,
                    EstimatedSetupTimeMinutes = resolved.Sum(r => r.Op.Setup ?? 0),
                    EstimatedCycleTimeMinutes = resolved.Where(r => r.Op.Cycle.HasValue).Sum(r => (decimal)r.Op.Cycle!.Value),
                    CreatedDate = DateTime.UtcNow,
                    IsSystem = false
                };
                _db.JobTemplateMaster.Add(template);
                _db.SaveChanges();

                var seq = 1;
                foreach (var item in resolved.OrderBy(r => r.Op.Sequence ?? int.MaxValue).ThenBy(r => r.Op.Row))
                {
                    _db.JobTemplateOperation.Add(new JobTemplateOperation
                    {
                        JobTemplateId = template.Id,
                        Tenantid = tenantId,
                        SequenceNumber = item.Op.Sequence ?? seq,
                        ProcessId = item.ProcessId,
                        WorkstationId = item.WorkstationId,
                        SetupTimeMinutes = item.Op.Setup,
                        CycleTimeMinutes = item.Op.Cycle,
                        Instructions = item.Op.Instructions.Length == 0 ? null : item.Op.Instructions,
                        IsMandatory = true,
                        QualityCheckRequired = false
                    });
                    seq++;
                }
                existing.Add(template);
                result.Created++;
            }

            _db.SaveChanges();
            return result;
        }

        private static List<string> NormalizeList(IEnumerable<string> masters) =>
            masters.Select(NormalizeMaster).Where(m => m != null).Select(m => m!).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

        private static string Label(string master) => master switch
        {
            Workstations => "Workstations",
            Processes => "Processes",
            _ => "Job templates"
        };

        private static void Fail(MasterImportResult result, int row, string message)
        {
            result.Failed++;
            Note(result, row, "Error", message);
        }

        private static void Skip(MasterImportResult result, int row, string message)
        {
            result.Skipped++;
            Note(result, row, "Skipped", message);
        }

        private static void Warn(MasterImportResult result, int row, string message) =>
            Note(result, row, "Warning", message);

        private static void Note(MasterImportResult result, int row, string status, string message)
        {
            if (result.Issues.Count >= 100) return;
            result.Issues.Add(new MasterRowIssue { RowNumber = row, Status = status, Message = message });
        }

        private static bool? ParseActive(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var v = value.Trim().ToLowerInvariant();
            if (v is "active" or "1" or "yes" or "true") return true;
            if (v is "inactive" or "0" or "no" or "false") return false;
            return null;
        }

        private static int? ParseProcessStatus(string? value)
        {
            var active = ParseActive(value);
            return active.HasValue ? (active.Value ? 1 : 0) : null;
        }

        private static int? ParseYesNo(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var v = value.Trim().ToLowerInvariant();
            if (v is "yes" or "y" or "1" or "true") return 1;
            if (v is "no" or "n" or "0" or "false") return 0;
            return null;
        }

        private sealed record ProcessIncoming(
            int Row, string Code, string Name, string Description, string Category, string Outside,
            string? Minutes, string Workstation, string Status, string Ledger, string Cost);

        private sealed record JobOpIncoming(
            int Row, string TemplateCode, string Name, string Description, int? Sequence, string ProcessCode,
            string Workstation, decimal? Setup, int? Cycle, string Instructions);
    }

    public class MasterSetupOverview
    {
        public string? Industry { get; set; }
        public MasterSetupCount Workstations { get; set; } = new();
        public MasterSetupCount Processes { get; set; } = new();
        public MasterSetupCount JobTemplates { get; set; } = new();
    }

    public class MasterSetupCount
    {
        public string Master { get; set; } = "";
        public int Count { get; set; }
        public string? LastSource { get; set; }
        public string? LastFileName { get; set; }
        public DateTime? LastCreatedUtc { get; set; }
        public int LastCreated { get; set; }
        public int LastUpdated { get; set; }
        public int LastSkipped { get; set; }
        public int LastFailed { get; set; }
    }

    public class MasterApplyBatch
    {
        public bool Success { get; set; }
        public string? Error { get; set; }
        public List<MasterImportResult> Results { get; set; } = new();
        public List<SeedStepResult> Steps => Results
            .Select(r => new SeedStepResult(r.Master, r.Created))
            .ToList();

        public static MasterApplyBatch Fail(string error) => new() { Success = false, Error = error };
    }

    public class MasterImportResult
    {
        public string Master { get; set; } = "";
        public int Created { get; set; }
        public int Updated { get; set; }
        public int Skipped { get; set; }
        public int Failed { get; set; }
        public List<MasterRowIssue> Issues { get; set; } = new();

        public static MasterImportResult Fail(string master, string error) => new()
        {
            Master = master,
            Failed = 1,
            Issues = { new MasterRowIssue { RowNumber = 0, Status = "Error", Message = error } }
        };
    }

    public class MasterRowIssue
    {
        public int RowNumber { get; set; }
        public string Status { get; set; } = "";
        public string Message { get; set; } = "";
    }
}
