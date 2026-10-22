using CimmpleAPI.Services.Auth;
using Microsoft.AspNetCore.Http;

namespace CimmpleAPI.Tests;

public class ErpPermissionLookupTests
{
    [Theory]
    [InlineData("GET", "/api/ProductMaster/GetPartsByCustomer", "ProductMaster", "/quotations/customer")]
    [InlineData("GET", "/api/ProductMaster/GetPartsByCustomer", "ProductMaster", "/orders/customer")]
    [InlineData("GET", "/api/ProductMaster/GetPartsByVendor", "ProductMaster", "/quotations/vendor")]
    [InlineData("GET", "/api/ProductMaster/GetPartsByVendor", "ProductMaster", "/purchasing/vendor-orders")]
    [InlineData("GET", "/api/ProductMaster/GetProductMasterList", "ProductMaster", "/inventory")]
    [InlineData("GET", "/api/PriceBreakdown/GetPriceBreakdowns", "PriceBreakdown", "/quotations/customer")]
    [InlineData("GET", "/api/ChartofAccounts/GetChartofAccounts", "ChartofAccounts", "/accounts/journal-entries")]
    [InlineData("GET", "/api/ChartofAccounts/GetChartofAccounts", "ChartofAccounts", "/quotations/vendor")]
    [InlineData("GET", "/api/Inventory/GetProducts", "Inventory", "/job-orders")]
    [InlineData("GET", "/api/Inventory/GetRawMaterials", "Inventory", "/purchasing/vendor-orders")]
    [InlineData("GET", "/api/Employee/GetEmployees", "Employee", "/job-orders")]
    [InlineData("GET", "/api/Employee/GetEmployees", "Employee", "/attendance")]
    [InlineData("GET", "/api/Process/GetProcesses", "Process", "/job-orders")]
    [InlineData("GET", "/api/Workstation/GetWorkstations", "Workstation", "/job-orders")]
    [InlineData("GET", "/api/JobTemplate/GetJobTemplates", "JobTemplate", "/job-orders")]
    [InlineData("GET", "/api/Category/GetCategoryTypes", "Category", "/job-orders")]
    [InlineData("GET", "/api/NCRCode/GetNCRCodes", "NCRCode", "/quality")]
    [InlineData("GET", "/api/Customer/GetCustomerlist", "Customer", "/quality")]
    [InlineData("GET", "/api/Vendor/GetVendorlist", "Vendor", "/quality")]
    [InlineData("GET", "/api/Bank/GetBanklist", "Bank", "/accounts/setup")]
    public void Lookup_IsAllowedFromThePageThatUsesIt(string method, string path, string controller, string page)
    {
        var pages = Resolve(method, path, controller);
        Assert.NotNull(pages);
        Assert.Contains(page, pages!);
    }

    [Theory]
    [InlineData("GET", "/api/ProductMaster/GetProductsFromOrders", "ProductMaster")]
    [InlineData("GET", "/api/ProductMaster/GetProductById", "ProductMaster")]
    [InlineData("POST", "/api/ProductMaster/SyncFromOrders", "ProductMaster")]
    [InlineData("POST", "/api/ProductMaster/SaveReorderPolicy", "ProductMaster")]
    [InlineData("POST", "/api/Inventory/SaveRawMaterial", "Inventory")]
    [InlineData("POST", "/api/Inventory/ReceiveStock", "Inventory")]
    [InlineData("GET", "/api/Employee/GetEmployeeById", "Employee")]
    [InlineData("GET", "/api/Workstation/GetAllUsers", "Workstation")]
    [InlineData("GET", "/api/UserManagement/GetUsers", "UserManagement")]
    public void MasterWriteAndFullRecord_StaysOnItsOwnPage(string method, string path, string controller)
    {
        var pages = Resolve(method, path, controller);
        Assert.NotNull(pages);
        Assert.Single(pages!);
        Assert.DoesNotContain("/quotations/customer", pages!);
        Assert.DoesNotContain("/orders/customer", pages!);
        Assert.DoesNotContain("/job-orders", pages!);
    }

    [Fact]
    public void CustomerQuotation_CanLoadPartsWithoutProductMaster()
    {
        var pages = Resolve("GET", "/api/ProductMaster/GetPartsByCustomer", "ProductMaster");
        var granted = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "/quotations/customer" };

        Assert.Contains(pages!, page => granted.Contains(page));
        Assert.True(ErpPermissionActions.HasAction(granted, "/quotations/customer", null));
    }

    [Fact]
    public void ProfilePicture_DoesNotRequireEmployeeMaster()
    {
        Assert.Null(Resolve("GET", "/api/Employee/GetProfilePic", "Employee"));
    }

    [Fact]
    public void MessageDirectory_IsAUtilityRead_NotUserManagement()
    {
        Assert.Null(Resolve("GET", "/api/Conversations/Directory", "Conversations"));
        var users = Resolve("GET", "/api/UserManagement/GetUsers", "UserManagement");
        Assert.Equal("/user-management", users![0]);
        Assert.True(ErpPermissionActions.IsAdminOnlyPage(users[0]));
    }

    private static string[]? Resolve(string method, string path, string controller)
    {
        var http = new DefaultHttpContext();
        http.Request.Method = method;
        http.Request.Path = path;
        http.Request.RouteValues["controller"] = controller;
        return ErpApiPermissionCatalog.ResolveRequiredPermissionUrls(http);
    }
}
