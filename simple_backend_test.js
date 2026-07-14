// =============================================
// SIMPLE BACKEND TEST - Add to your ASP.NET Core project
// =============================================
// This is a simplified version you can add to test the endpoints quickly

using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using System.Threading.Tasks;

// Add this to your existing OrderController.cs

namespace YourProject.Controllers
{
    public partial class OrderController : ControllerBase
    {
        // =============================================
        // VENDOR ORDER ENDPOINTS - Add these to your OrderController
        // =============================================

        [HttpGet("GetVendorOrders")]
        public async Task<IActionResult> GetVendorOrders(int tenantId)
        {
            var vendorOrders = await _context.VendorOrders
                .Where(o => o.Tenantid == tenantId)
                .Include(o => o.VendorOrderDetails)
                .OrderByDescending(o => o.OrderDate)
                .ToListAsync();

            return Ok(new { result = vendorOrders });
        }

        [HttpGet("GetVendorOrderById")]
        public async Task<IActionResult> GetVendorOrderById(int orderId, int tenantId)
        {
            var order = await _context.VendorOrders
                .Where(o => o.OrderID == orderId && o.Tenantid == tenantId)
                .Include(o => o.VendorOrderDetails)
                .Include(o => o.VendorOrderAttachments)
                .Include(o => o.VendorOrderComments)
                .FirstOrDefaultAsync();

            if (order == null)
                return NotFound();

            return Ok(new { result = order });
        }

        [HttpPost("SaveVendorOrder")]
        public async Task<IActionResult> SaveVendorOrder([FromBody] dynamic orderData)
        {
            try
            {
                // Convert dynamic to VendorOrder object
                var order = new VendorOrder
                {
                    OrderID = orderData.OrderID ?? 0,
                    Tenantid = orderData.Tenantid,
                    VendorID = orderData.VendorID,
                    VendorCode = orderData.VendorCode,
                    PONumber = orderData.PONumber ?? 0,
                    VendorName = orderData.VendorName,
                    Address = orderData.Address,
                    VendorPoNumber = orderData.VendorPoNumber,
                    OrderDate = DateTime.Parse(orderData.OrderDate),
                    TotalAmount = orderData.TotalAmount ?? 0,
                    UserId = orderData.UserId,
                    UserToken = orderData.UserToken,
                    Status = orderData.Status ?? "Draft",
                    ShippingInstructions = orderData.ShippingInstructions,
                    ExternalVendorPO = orderData.ExternalVendorPO,
                    BuyerName = orderData.BuyerName,
                    VendorRefNo = orderData.VendorRefNo,
                    OrderType = orderData.OrderType,
                    MaterialType = orderData.MaterialType ?? "Material",
                    ParentQuotationID = orderData.ParentQuotationID
                };

                if (order.OrderID == 0)
                {
                    // Generate PO number for new orders
                    if (order.PONumber == 0)
                    {
                        var maxOrder = await _context.VendorOrders
                            .Where(o => o.Tenantid == order.Tenantid)
                            .OrderByDescending(o => o.PONumber)
                            .FirstOrDefaultAsync();
                        order.PONumber = (maxOrder?.PONumber ?? 0) + 1;
                    }

                    _context.VendorOrders.Add(order);
                }
                else
                {
                    _context.VendorOrders.Update(order);
                }

                await _context.SaveChangesAsync();

                return Ok(new
                {
                    result = new
                    {
                        id = order.OrderID,
                        message = "Vendor order saved successfully"
                    }
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpDelete("DeleteVendorOrder")]
        public async Task<IActionResult> DeleteVendorOrder(int orderId, int tenantId)
        {
            var order = await _context.VendorOrders
                .FindAsync(orderId);

            if (order == null || order.Tenantid != tenantId)
                return NotFound();

            _context.VendorOrders.Remove(order);
            await _context.SaveChangesAsync();

            return Ok(new { result = "Deleted successfully" });
        }
    }
}

// =============================================
// ADD THESE ENTITY CLASSES to your Models folder
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

    public VendorOrder VendorOrder { get; set; }
}

public class VendorOrderComment
{
    public int Id { get; set; }
    public int OrderID { get; set; }
    public string Text { get; set; }
    public DateTime CreatedAt { get; set; }
    public string CreatedBy { get; set; }

    public VendorOrder VendorOrder { get; set; }
}

// =============================================
// ADD THIS TO YOUR DBCONTEXT OnModelCreating METHOD
// =============================================

protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    // ... your existing configurations ...

    // Vendor Orders
    modelBuilder.Entity<VendorOrder>(entity =>
    {
        entity.ToTable("VendorOrders");
        entity.HasKey(e => e.OrderID);
        entity.Property(e => e.MaterialType).HasDefaultValue("Material");
        entity.Property(e => e.OrderType).HasDefaultValue("Vendor");
    });

    modelBuilder.Entity<VendorOrderDetail>(entity =>
    {
        entity.ToTable("VendorOrderDetails");
        entity.HasKey(e => e.ID);
        entity.HasOne(d => d.VendorOrder)
            .WithMany(o => o.VendorOrderDetails)
            .HasForeignKey(d => d.OrderID);
    });

    modelBuilder.Entity<VendorOrderAttachment>(entity =>
    {
        entity.ToTable("VendorOrderAttachments");
        entity.HasKey(e => e.Id);
        entity.HasOne(a => a.VendorOrder)
            .WithMany(o => o.VendorOrderAttachments)
            .HasForeignKey(a => a.OrderID);
    });

    modelBuilder.Entity<VendorOrderComment>(entity =>
    {
        entity.ToTable("VendorOrderComments");
        entity.HasKey(e => e.Id);
        entity.HasOne(c => c.VendorOrder)
            .WithMany(o => o.VendorOrderComments)
            .HasForeignKey(c => c.OrderID);
    });
}

































