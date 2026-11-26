using CimmpleAPI.Services.Tenancy;

namespace CimmpleAPI.Tests;

public class LoginSeatRulesTests
{
    [Theory]
    [InlineData(null, "ada", "secret", "Active", true)]
    [InlineData(0, "ada", "secret", "Active", true)]
    [InlineData(null, "ada", "secret", "", true)]
    [InlineData(null, "ada", "secret", "A", true)]
    [InlineData(null, "ada", "secret", "Inactive", false)]
    [InlineData(null, "", "secret", "Active", false)]
    [InlineData(null, "ada", "", "Active", false)]
    [InlineData(4, "vendor", "secret", "Active", false)]
    public void Occupies_only_active_employee_logins(int? vendorId, string userName, string password, string status, bool expected)
    {
        Assert.Equal(expected, LoginSeatRules.Occupies(vendorId, userName, password, status));
    }

    [Fact]
    public void Admin_login_does_not_use_a_seat()
    {
        Assert.False(LoginSeatRules.Occupies(null, "admin", "secret", "Active", isAdmin: true));
    }

    [Fact]
    public void Missing_or_zero_limit_blocks_a_new_login()
    {
        var missing = LoginSeatRules.DenialForNewSeat(null, usedByOthers: 0);
        Assert.NotNull(missing);
        Assert.Equal(0, missing!.LoginSeatLimit);
        Assert.Contains("No login seats are allotted", missing.Error);

        var zero = LoginSeatRules.DenialForNewSeat(0, usedByOthers: 0);
        Assert.NotNull(zero);
        Assert.Contains("No login seats are allotted", zero!.Error);
    }

    [Fact]
    public void Next_enable_at_the_cap_is_rejected_with_usage()
    {
        var denial = LoginSeatRules.DenialForNewSeat(3, usedByOthers: 3);
        Assert.NotNull(denial);
        Assert.Equal(3, denial!.LoginSeatLimit);
        Assert.Equal(3, denial.UsedSeats);
        Assert.Equal(0, denial.AvailableSeats);
        Assert.Contains("3 of 3", denial.Error);
    }

    [Fact]
    public void Seat_below_the_cap_is_allowed()
    {
        Assert.Null(LoginSeatRules.DenialForNewSeat(3, usedByOthers: 2));
    }

    [Fact]
    public void Unsaved_release_in_the_same_batch_frees_a_seat()
    {
        Assert.Null(LoginSeatRules.DenialForNewSeat(3, usedByOthers: 3, extraReserved: -1));
    }

    [Fact]
    public void Unsaved_reserve_in_the_same_batch_counts()
    {
        var denial = LoginSeatRules.DenialForNewSeat(3, usedByOthers: 2, extraReserved: 1);
        Assert.NotNull(denial);
        Assert.Equal(3, denial!.UsedSeats);
    }

    [Fact]
    public void Usage_reports_available_seats_and_an_unset_cap()
    {
        var open = LoginSeatRules.Usage(5, 2);
        Assert.True(open.Configured);
        Assert.Equal(3, open.AvailableSeats);

        var unset = LoginSeatRules.Usage(null, 4);
        Assert.True(unset.Configured);
        Assert.Equal(0, unset.LoginSeatLimit);
        Assert.Equal(0, unset.AvailableSeats);
    }

    [Fact]
    public void New_client_requires_a_positive_login_seat_limit()
    {
        var missing = new ProvisionTenantRequest
        {
            CompanyName = "Test Shop",
            AdminFirstName = "Ada",
            AdminLastName = "Lovelace",
            AdminEmail = "ada@example.com"
        };
        Assert.Contains("Login seats", TenantProvisioningService.ValidateNewClient(missing)!);

        missing.LoginSeatLimit = 0;
        Assert.Null(TenantProvisioningService.ValidateNewClient(missing));

        missing.LoginSeatLimit = -1;
        Assert.Contains("Login seats", TenantProvisioningService.ValidateNewClient(missing)!);

        missing.LoginSeatLimit = 1;
        Assert.Null(TenantProvisioningService.ValidateNewClient(missing));
    }
}
