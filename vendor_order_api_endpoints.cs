// =============================================
// Vendor Order API Endpoints - Backend Implementation
// =============================================
// Add these endpoints to your OrderController.cs or create VendorOrderController.cs

using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using System.Threading.Tasks;

namespace YourNamespace.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class OrderController : ControllerBase
    {
        private readonly YourDbContext _context;

        public OrderController(YourDbContext context)
        {
            _context = context;
        }

        // =============================================
        // 1. GET VENDOR ORDERS
        // =============================================
        [HttpGet("GetVendorOrders")]
        public async Task<IActionResult> GetVendorOrders(int tenantId)
        {
            try
            {
                var vendorOrders = await _context.VendorOrders
                    .Where(o => o.Tenantid == tenantId)
                    .Include(o => o.VendorOrderDetails)
                    .Include(o => o.VendorOrderAttachments)
                    .Include(o => o.VendorOrderComments)
                    .OrderByDescending(o => o.OrderDate)
                    .ToListAsync();

                return Ok(new { result = vendorOrders });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        // =============================================
        // 2. GET VENDOR ORDER BY ID
        // =============================================
        [HttpGet("GetVendorOrderById")]
        public async Task<IActionResult> GetVendorOrderById(int orderId, int tenantId)
        {
            try
            {
                var order = await _context.VendorOrders
                    .Where(o => o.OrderID == orderId && o.Tenantid == tenantId)
                    .Include(o => o.VendorOrderDetails)
                    .Include(o => o.VendorOrderAttachments)
                    .Include(o => o.VendorOrderComments)
                    .FirstOrDefaultAsync();

                if (order == null)
                    return NotFound(new { error = "Vendor order not found" });

                return Ok(new { result = order });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        // =============================================
        // 3. SAVE VENDOR ORDER
        // =============================================
        [HttpPost("SaveVendorOrder")]
        public async Task<IActionResult> SaveVendorOrder([FromBody] VendorOrder order)
        {
            try
            {
                if (order.OrderID == 0)
                {
                    // New order - generate PONumber if not provided
                    if (order.PONumber == 0)
                    {
                        var maxOrder = await _context.VendorOrders
                            .Where(o => o.Tenantid == order.Tenantid)
                            .OrderByDescending(o => o.PONumber)
                            .FirstOrDefaultAsync();

                        order.PONumber = (maxOrder?.PONumber ?? 0) + 1;
                    }

                    // Set default values
                    order.Status = order.Status ?? "Draft";
                    order.MaterialType = order.MaterialType ?? "Material";

                    _context.VendorOrders.Add(order);
                }
                else
                {
                    // Update existing order
                    var existingOrder = await _context.VendorOrders
                        .Where(o => o.OrderID == order.OrderID && o.Tenantid == order.Tenantid)
                        .FirstOrDefaultAsync();

                    if (existingOrder == null)
                        return NotFound(new { error = "Vendor order not found" });

                    // Update fields (implement your update logic)
                    _context.Entry(existingOrder).CurrentValues.SetValues(order);
                }

                await _context.SaveChangesAsync();

                return Ok(new {
                    result = new {
                        id = order.OrderID,
                        message = order.OrderID == 0 ? "Vendor order created successfully" : "Vendor order updated successfully"
                    }
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        // =============================================
        // 4. DELETE VENDOR ORDER
        // =============================================
        [HttpDelete("DeleteVendorOrder")]
        public async Task<IActionResult> DeleteVendorOrder(int orderId, int tenantId)
        {
            try
            {
                var order = await _context.VendorOrders
                    .Where(o => o.OrderID == orderId && o.Tenantid == tenantId)
                    .FirstOrDefaultAsync();

                if (order == null)
                    return NotFound(new { error = "Vendor order not found" });

                // Delete related records first (if cascade delete is not set up)
                var details = _context.VendorOrderDetails.Where(d => d.OrderID == orderId);
                var attachments = _context.VendorOrderAttachments.Where(a => a.OrderID == orderId);
                var comments = _context.VendorOrderComments.Where(c => c.OrderID == orderId);

                _context.VendorOrderDetails.RemoveRange(details);
                _context.VendorOrderAttachments.RemoveRange(attachments);
                _context.VendorOrderComments.RemoveRange(comments);

                _context.VendorOrders.Remove(order);
                await _context.SaveChangesAsync();

                return Ok(new { result = "Vendor order deleted successfully" });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }
    }

    // =============================================
    // ENTITY MODELS (add to your DbContext)
    // =============================================

    public class VendorOrder
    {
        public int OrderID { get; set; }
        public int Tenantid { get; set; }
        public int VendorID { get; set; }
        public string VendorCode { get; set; }
        public int PONumber { get; set; }
        public string VendorName { get; set; }
        public string Address { get; set; }
        public string VendorPoNumber { get; set; }
        public DateTime OrderDate { get; set; }
        public decimal TotalAmount { get; set; }
        public int UserId { get; set; }
        public int UserToken { get; set; }
        public string Status { get; set; }
        public string ShippingInstructions { get; set; }
        public string ExternalVendorPO { get; set; }
        public DateTime? ExternalOrderDate { get; set; }
        public string BuyerName { get; set; }
        public string VendorRefNo { get; set; }
        public string OrderType { get; set; }
        public string MaterialType { get; set; }
        public int? LocationId { get; set; }
        public int? convertedOrderId { get; set; }
        public int? ParentQuotationID { get; set; }
        public string AdditionalNotes { get; set; }

        // Navigation properties
        public ICollection<VendorOrderDetail> VendorOrderDetails { get; set; }
        public ICollection<VendorOrderAttachment> VendorOrderAttachments { get; set; }
        public ICollection<VendorOrderComment> VendorOrderComments { get; set; }
    }

    public class VendorOrderDetail
    {
        public int ID { get; set; }
        public int OrderID { get; set; }
        public int ItemNo { get; set; }
        public string PartName { get; set; }
        public string PartNo { get; set; }
        public string DueDate { get; set; }
        public string JobNumber { get; set; }
        public string JobDesc { get; set; }
        public int QtyOrdered { get; set; }
        public string Unit { get; set; }
        public decimal UnitPrice { get; set; }
        public int JobPriority { get; set; }
        public decimal Discount { get; set; }
        public int? ProductId { get; set; }
        public string LeadTime { get; set; }
        public string Notes { get; set; }
        public int ShippedQty { get; set; }
        public string ShippingStatus { get; set; }
        public int InvoicedQty { get; set; }
        public string InvoiceStatus { get; set; }

        // Navigation property
        public VendorOrder VendorOrder { get; set; }
    }

    public class VendorOrderAttachment
    {
        public int Id { get; set; }
        public int OrderID { get; set; }
        public string Name { get; set; }
        public long Size { get; set; }
        public string FileUrl { get; set; }
        public DateTime CreatedDate { get; set; }

        // Navigation property
        public VendorOrder VendorOrder { get; set; }
    }

    public class VendorOrderComment
    {
        public int Id { get; set; }
        public int OrderID { get; set; }
        public string Text { get; set; }
        public DateTime CreatedAt { get; set; }
        public string CreatedBy { get; set; }

        // Navigation property
        public VendorOrder VendorOrder { get; set; }
    }
}

// =============================================
// ADD TO YOUR DBCONTEXT (OnModelCreating)
// =============================================

protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    // Vendor Orders configuration
    modelBuilder.Entity<VendorOrder>(entity =>
    {
        entity.ToTable("VendorOrders");
        entity.HasKey(e => e.OrderID);
        entity.Property(e => e.MaterialType).HasDefaultValue("Material");
    });

    // Vendor Order Details configuration
    modelBuilder.Entity<VendorOrderDetail>(entity =>
    {
        entity.ToTable("VendorOrderDetails");
        entity.HasKey(e => e.ID);
        entity.HasOne(d => d.VendorOrder)
            .WithMany(o => o.VendorOrderDetails)
            .HasForeignKey(d => d.OrderID);
    });

    // Vendor Order Attachments configuration
    modelBuilder.Entity<VendorOrderAttachment>(entity =>
    {
        entity.ToTable("VendorOrderAttachments");
        entity.HasKey(e => e.Id);
        entity.HasOne(a => a.VendorOrder)
            .WithMany(o => o.VendorOrderAttachments)
            .HasForeignKey(a => a.OrderID);
        entity.Property(e => e.CreatedDate).HasDefaultValueSql("GETUTCDATE()");
    });

    // Vendor Order Comments configuration
    modelBuilder.Entity<VendorOrderComment>(entity =>
    {
        entity.ToTable("VendorOrderComments");
        entity.HasKey(e => e.Id);
        entity.HasOne(c => c.VendorOrder)
            .WithMany(o => o.VendorOrderComments)
            .HasForeignKey(c => c.OrderID);
        entity.Property(e => e.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
    });
}

































