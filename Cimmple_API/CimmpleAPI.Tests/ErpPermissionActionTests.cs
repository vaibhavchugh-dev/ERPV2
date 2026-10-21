using CimmpleAPI.Controllers;
using CimmpleAPI.Services.Auth;
using CimmpleAPI.Utilities;

namespace CimmpleAPI.Tests;

public class ErpPermissionActionTests
{
    [Theory]
    [InlineData("GET", "/api/Shipping/GetShippableItems/4", null)]
    [InlineData("GET", "/api/Shipping/GetAllShipments", null)]
    [InlineData("GET", "/api/Invoice/GetInvoiceableItems/4", null)]
    [InlineData("GET", "/api/Order/GetOrdersForReceiving", null)]
    [InlineData("DELETE", "/api/Shipping/DeleteShipment", "Delete")]
    [InlineData("DELETE", "/api/Invoice/DeleteInvoice", "Delete")]
    [InlineData("POST", "/api/Shipping/CreateShipment", "Ship")]
    [InlineData("POST", "/api/Invoice/CreateInvoice", "Invoice")]
    [InlineData("POST", "/api/Order/CreateVendorInvoice", "Invoice")]
    [InlineData("POST", "/api/VendorInvoice/CreateVendorInvoice", "Add")]
    [InlineData("POST", "/api/Order/ReceiveLineItem", "Receive")]
    [InlineData("POST", "/api/Quotation/SaveQuotation", "Edit")]
    [InlineData("POST", "/api/Quotation/CopyAttachmentsToOrder", "Convert")]
    [InlineData("POST", "/api/Quotation/ConvertVendorQuotationToOrder", "Convert")]
    [InlineData("POST", "/api/JobOrder/SaveJobOrder", "Edit")]
    [InlineData("POST", "/api/JobTemplate/CloneJobTemplate", "Add")]
    [InlineData("GET", "/api/Pdf/GenerateShipment", "Print")]
    [InlineData("POST", "/api/DocumentEmail/SendShipment", "Send")]
    [InlineData("POST", "/api/Payroll/PreviewManual", null)]
    [InlineData("POST", "/api/Payroll/PostPayment", "Pay")]
    [InlineData("POST", "/api/Invoice/RecordCustomerPayment/3", "Pay")]
    [InlineData("POST", "/api/Invoice/VoidInvoice/3", "Void")]
    [InlineData("POST", "/api/JournalEntry/Create", "Post")]
    [InlineData("POST", "/api/JournalEntry/Reverse", "Reverse")]
    public void ResolveAction_MatchesLevel2(string method, string path, string? expected)
    {
        Assert.Equal(expected, ErpPermissionActions.ResolveActionFromRequest(method, path));
    }

    [Fact]
    public void NewQuotationSave_RequiresAdd_NotEdit()
    {
        var alts = ErpPermissionActions.BuildAlternatives(
            new[] { "/quotations/customer" },
            ErpPermissionActions.Edit,
            "/api/Quotation/SaveQuotation",
            """{"OrderID":0,"CustomerID":3}""");

        Assert.Contains(alts, a => a.PageUrl == "/quotations/customer" && a.Action == "Add");
        Assert.DoesNotContain(alts, a => a.Action == "Edit");
    }

    [Fact]
    public void ExistingOrderSave_RequiresEdit()
    {
        var alts = ErpPermissionActions.BuildAlternatives(
            new[] { "/orders/customer" },
            ErpPermissionActions.Edit,
            "/api/Order/SaveOrder",
            """{"OrderID":12,"QuotationId":0}""");

        Assert.Contains(alts, a => a.PageUrl == "/orders/customer" && a.Action == "Edit");
        Assert.DoesNotContain(alts, a => a.Action == "Convert");
    }

    [Fact]
    public void ConvertQuotation_CanUseConvertWithoutCustomerOrderAdd()
    {
        var alts = ErpPermissionActions.BuildAlternatives(
            new[] { "/orders/customer" },
            ErpPermissionActions.Edit,
            "/api/Order/SaveOrder",
            """{"OrderID":0,"QuotationId":9}""");

        Assert.Contains(alts, a => a.PageUrl == "/orders/customer" && a.Action == "Add");
        Assert.Contains(alts, a => a.PageUrl == "/quotations/customer" && a.Action == "Convert");
    }

    [Fact]
    public void SaveJobOrder_AlsoAcceptsCompleteWhenPayloadCompletes()
    {
        var alts = ErpPermissionActions.BuildAlternatives(
            new[] { "/job-orders" },
            ErpPermissionActions.Edit,
            "/api/JobOrder/SaveJobOrder",
            """{"JobOrderID":5,"Status":"Completed"}""");

        Assert.Contains(alts, a => a.PageUrl == "/job-orders" && a.Action == "Edit");
        Assert.Contains(alts, a => a.PageUrl == "/job-orders" && a.Action == "Complete");
    }

    [Fact]
    public void CreateJournalEntry_AcceptsPostOrAdd()
    {
        var alts = ErpPermissionActions.BuildAlternatives(
            new[] { "/accounts/journal-entries" },
            ErpPermissionActions.Post,
            "/api/JournalEntry/Create",
            """{"entryDate":"2026-10-21"}""");

        Assert.Contains(alts, a => a.PageUrl == "/accounts/journal-entries" && a.Action == "Post");
        Assert.Contains(alts, a => a.PageUrl == "/accounts/journal-entries" && a.Action == "Add");
    }

    [Fact]
    public void NewlyCompletes_IgnoresAlreadyCompletedJob()
    {
        var existing = new List<JobOrderRoutingStepDto>
        {
            new() { id = 1, status = "Completed" }
        };
        var incoming = new List<JobOrderRoutingStepDto>
        {
            new() { id = 1, status = "Completed", processName = "changed" }
        };

        Assert.False(JobOrderTrackingHelper.NewlyCompletes("Completed", existing, incoming));
    }

    [Fact]
    public void NewlyCompletes_DetectsStepTransition()
    {
        var existing = new List<JobOrderRoutingStepDto>
        {
            new() { id = 1, status = "In Progress", processName = "Cut" }
        };
        var incoming = new List<JobOrderRoutingStepDto>
        {
            new() { id = 1, status = "Completed", processName = "Cut" }
        };

        Assert.True(JobOrderTrackingHelper.NewlyCompletes("In Progress", existing, incoming));
    }

    [Fact]
    public void MergeCompletionProgress_DoesNotChangeProcessOrAddSteps()
    {
        var existing = new List<JobOrderRoutingStepDto>
        {
            new() { id = 1, processName = "Cut", status = "In Progress" }
        };
        var incoming = new List<JobOrderRoutingStepDto>
        {
            new() { id = 1, processName = "Hacked", status = "Completed" },
            new() { id = 2, processName = "Extra", status = "Completed" }
        };

        var merged = JobOrderTrackingHelper.MergeCompletionProgress(existing, incoming);

        Assert.Single(merged);
        Assert.Equal("Cut", merged[0].processName);
        Assert.Equal("Completed", merged[0].status);
    }

    [Fact]
    public void HasAction_DeniesWhenLevel2CatalogExistsButActionNotGranted()
    {
        var urls = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "/orders/customer" };
        Assert.False(ErpPermissionActions.HasAction(urls, "/orders/customer", "Add"));
        urls.Add("/orders/customer#add");
        Assert.True(ErpPermissionActions.HasAction(urls, "/orders/customer", "Add"));
        Assert.False(ErpPermissionActions.HasAction(urls, "/orders/customer", "Edit"));
    }
}
