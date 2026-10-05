using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services
{
    public static class EmployeeUserDetailSchemaService
    {
        private static readonly SemaphoreSlim Gate = new(1, 1);
        private static bool _countryColumnEnsured;

        public static async Task EnsureCountryColumnAsync(CimmpleDbContext context)
        {
            if (_countryColumnEnsured)
            {
                return;
            }

            await Gate.WaitAsync();
            try
            {
                if (_countryColumnEnsured)
                {
                    return;
                }

                await context.Database.ExecuteSqlRawAsync(@"
IF COL_LENGTH('UserDetails', 'Country') IS NULL
    ALTER TABLE UserDetails ADD Country nvarchar(50) NULL;
");

                _countryColumnEnsured = true;
            }
            finally
            {
                Gate.Release();
            }
        }
    }
}
