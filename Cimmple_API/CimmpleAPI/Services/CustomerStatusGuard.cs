using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;
using System.Linq;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Inactive customers keep their existing documents but must not receive new quotations or orders.
    /// </summary>
    public static class CustomerStatusGuard
    {
        public const string InactiveMessage = "This customer is inactive. Activate the customer before creating new quotations or orders for them.";

        /// <summary>
        /// True when the document is new (or is being moved to a different customer) and that customer is inactive.
        /// </summary>
        public static bool BlocksAssignment(CimmpleDbContext db, int tenantId, int customerId, int? currentCustomerId)
        {
            if (currentCustomerId.HasValue && currentCustomerId.Value == customerId) return false;
            return db.CustomerMaster.AsNoTracking().Any(c =>
                c.customer_id == customerId &&
                c.Tenantid == tenantId &&
                c.status != null &&
                c.status.Trim().ToLower() == "inactive");
        }
    }
}
