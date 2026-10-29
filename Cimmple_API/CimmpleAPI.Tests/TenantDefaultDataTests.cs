using CimmpleAPI.Data.Seeds;
using CimmpleAPI.Services.Tenancy;

namespace CimmpleAPI.Tests;

public class TenantDefaultDataTests
{
    [Fact]
    public void ApplyDefaultData_is_only_roles_permissions_chart_and_payment_terms()
    {
        var names = TenantSeeders.ApplyDefaultData.Select(s => s.Name).ToArray();
        Assert.Equal(new[] { "Roles", "Role permissions", "Chart of accounts", "Payment terms" }, names);
    }

    [Fact]
    public void Provisioning_defaults_do_not_include_categories_or_ncr_codes()
    {
        var names = TenantSeeders.Defaults.Select(s => s.Name).ToArray();
        Assert.DoesNotContain(names, n => n.Contains("Categor", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(names, n => n.Contains("NCR", StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData("machine-shop")]
    [InlineData("electronics")]
    public void Selected_options_insert_only_the_checked_shop_samples(string industry)
    {
        var none = TenantProvisioningService.SampleMastersFor(Request(industry));
        Assert.Empty(none);

        var stations = TenantProvisioningService.SampleMastersFor(Request(industry, r => r.IncludeSampleWorkstations = true));
        Assert.Equal(new[] { MasterDataSetupService.Workstations }, stations);

        var processes = TenantProvisioningService.SampleMastersFor(Request(industry, r => r.IncludeSampleProcesses = true));
        Assert.Equal(new[] { MasterDataSetupService.Processes }, processes);

        var ncr = TenantProvisioningService.SampleMastersFor(Request(industry, r => r.IncludeSampleNcrCodes = true));
        Assert.Equal(new[] { MasterDataSetupService.NcrCodes }, ncr);

        var templates = TenantProvisioningService.SampleMastersFor(Request(industry, r =>
        {
            r.IncludeSampleProcesses = true;
            r.IncludeSampleJobTemplates = true;
        }));
        Assert.Equal(
            new[]
            {
                MasterDataSetupService.Processes,
                MasterDataSetupService.JobTemplates,
                MasterDataSetupService.Categories
            },
            templates);

        var all = TenantProvisioningService.SampleMastersFor(Request(industry, r => r.IncludeSampleData = true));
        Assert.Equal(
            new[]
            {
                MasterDataSetupService.Workstations,
                MasterDataSetupService.Processes,
                MasterDataSetupService.JobTemplates,
                MasterDataSetupService.Categories,
                MasterDataSetupService.NcrCodes
            },
            all);
    }

    [Theory]
    [InlineData("machine-shop")]
    [InlineData("electronics")]
    public void Sample_options_require_an_industry_and_templates_require_processes(string industry)
    {
        var missingIndustry = Request(null, r => r.IncludeSampleWorkstations = true);
        Assert.Equal(
            "Choose an industry when including sample workstations, processes, job templates, or NCR codes.",
            TenantProvisioningService.ValidateNewClient(missingIndustry));

        var templatesWithoutProcesses = Request(industry, r => r.IncludeSampleJobTemplates = true);
        Assert.Equal(
            "Include sample processes when including sample job templates and categories.",
            TenantProvisioningService.ValidateNewClient(templatesWithoutProcesses));

        Assert.Null(TenantProvisioningService.ValidateNewClient(Request(industry)));
        Assert.Null(TenantProvisioningService.ValidateNewClient(Request(null)));
    }

    [Fact]
    public void Ncr_codes_are_omitted_when_no_industry_is_selected()
    {
        var masters = TenantProvisioningService.SampleMastersFor(Request(null, r =>
        {
            r.IncludeSampleWorkstations = true;
            r.IncludeSampleProcesses = true;
            r.IncludeSampleJobTemplates = true;
        }));
        Assert.DoesNotContain(MasterDataSetupService.NcrCodes, masters);
        Assert.Contains(MasterDataSetupService.Categories, masters);
    }

    [Fact]
    public void Machine_and_electronics_categories_share_type_codes_and_differ_in_values()
    {
        var machine = IndustryPacks.CategoryTypesFor("machine-shop");
        var electronics = IndustryPacks.CategoryTypesFor("electronics");

        Assert.Equal(machine.Select(t => t.Code), electronics.Select(t => t.Code));
        Assert.Contains(machine.Single(t => t.Code == "PROCESS").Values, v => v == "Milling");
        Assert.Contains(electronics.Single(t => t.Code == "PROCESS").Values, v => v == "SMT");
        Assert.DoesNotContain(electronics.Single(t => t.Code == "PROCESS").Values, v => v == "Milling");
        Assert.Contains(electronics.Single(t => t.Code == "MATERIAL").Values, v => v == "FR-4");
        Assert.Contains(electronics.Single(t => t.Code == "INSPECTION").Values, v => v == "AOI");
    }

    [Fact]
    public void Ncr_codes_follow_the_shop_type_without_duplicates()
    {
        var machine = IndustryPacks.NcrCodesFor("machine-shop");
        var electronics = IndustryPacks.NcrCodesFor("electronics");

        Assert.Equal(machine.Count, machine.Select(c => c.Code).Distinct(StringComparer.OrdinalIgnoreCase).Count());
        Assert.Equal(electronics.Count, electronics.Select(c => c.Code).Distinct(StringComparer.OrdinalIgnoreCase).Count());

        Assert.Contains(machine, c => c.Code == "DIM-001");
        Assert.DoesNotContain(machine, c => c.Code == "SLD-001");
        Assert.Contains(electronics, c => c.Code == "SLD-001");
        Assert.DoesNotContain(electronics, c => c.Code == "DIM-001");
        Assert.Contains(electronics, c => c.Code == "DOC-001");
        Assert.Contains(machine, c => c.Code == "DOC-001");
        Assert.Equal(NCRCodeSeedData.DefaultCodes.Length, machine.Count);
    }

    [Theory]
    [InlineData("machine-shop")]
    [InlineData("electronics")]
    public void Job_template_steps_reference_processes_in_the_same_shop(string industry)
    {
        Assert.Empty(IndustryPacks.MissingJobTemplateProcesses(industry));
    }

    private static ProvisionTenantRequest Request(string? industry, Action<ProvisionTenantRequest>? edit = null)
    {
        var request = new ProvisionTenantRequest
        {
            CompanyName = "Test Shop",
            AdminFirstName = "Ada",
            AdminLastName = "Lovelace",
            AdminEmail = "ada@example.com",
            Industry = industry,
            LoginSeatLimit = 3
        };
        edit?.Invoke(request);
        return request;
    }
}
