using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Data.Pay
{
    /// <summary>
    /// Cross-schema access to CimmplePay tables on the shared CimmpleERPDB catalog.
    /// Does not own migrations — Pay schema is owned by the CimmplePay project.
    /// </summary>
    public class PayDbContext : DbContext
    {
        public PayDbContext(DbContextOptions<PayDbContext> options)
            : base(options)
        {
        }

        public DbSet<PayCompany> Companies => Set<PayCompany>();
        public DbSet<PayEmployee> Employees => Set<PayEmployee>();
        public DbSet<PayTimeEntry> TimeEntries => Set<PayTimeEntry>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.HasDefaultSchema(DbSchema.Pay);

            foreach (var entityType in modelBuilder.Model.GetEntityTypes())
            {
                entityType.SetIsTableExcludedFromMigrations(true);
            }
        }
    }
}
