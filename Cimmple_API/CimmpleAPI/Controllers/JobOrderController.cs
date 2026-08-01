using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [AllowAnonymous]
    public class JobOrderController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public JobOrderController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetJobOrders")]
        public IActionResult GetJobOrders([FromQuery] int tenantid)
        {
            try
            {
                var jobOrders = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantid)
                    .OrderByDescending(j => j.OrderDate)
                    .Select(j => new
                    {
                        jobOrderID = j.JobOrderID,
                        jobOrderNumber = j.JobOrderNumber,
                        customerOrderID = j.CustomerOrderID,
                        customerOrderDetailID = j.CustomerOrderDetailID,
                        customerID = j.CustomerID,
                        customerName = j.CustomerName ?? "",
                        customerCode = j.CustomerCode ?? "",
                        partNo = j.PartNo ?? "",
                        partName = j.PartName ?? "",
                        qtyOrdered = j.QtyOrdered,
                        unit = j.Unit ?? "",
                        unitPrice = j.UnitPrice,
                        dueDate = j.DueDate,
                        jobNumber = j.JobNumber ?? "",
                        jobDesc = j.JobDesc ?? "",
                        jobPriority = j.JobPriority,
                        status = j.Status ?? "Draft",
                        orderDate = j.OrderDate
                    })
                    .ToList();

                return Ok(new { result = jobOrders });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetJobOrderById")]
        public IActionResult GetJobOrderById([FromQuery] int jobOrderId, [FromQuery] int tenantId)
        {
            try
            {
                var jobOrder = _context.JobOrderMaster
                    .FirstOrDefault(j => j.JobOrderID == jobOrderId && j.Tenantid == tenantId);

                if (jobOrder == null)
                {
                    return NotFound(new { error = "Job order not found" });
                }

                // Deserialize attachments and comments
                List<JobOrderAttachmentDto> attachments = null;
                if (!string.IsNullOrEmpty(jobOrder.AttachmentsJson))
                {
                    try
                    {
                        attachments = JsonSerializer.Deserialize<List<JobOrderAttachmentDto>>(jobOrder.AttachmentsJson, new JsonSerializerOptions
                        {
                            PropertyNameCaseInsensitive = true
                        });
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error deserializing attachments: {ex.Message}");
                    }
                }

                List<JobOrderCommentDto> comments = null;
                if (!string.IsNullOrEmpty(jobOrder.CommentsJson))
                {
                    try
                    {
                        comments = JsonSerializer.Deserialize<List<JobOrderCommentDto>>(jobOrder.CommentsJson, new JsonSerializerOptions
                        {
                            PropertyNameCaseInsensitive = true
                        });
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error deserializing comments: {ex.Message}");
                    }
                }

                List<JobOrderRoutingStepDto> routingSteps = null;
                if (!string.IsNullOrEmpty(jobOrder.RoutingStepsJson))
                {
                    try
                    {
                        routingSteps = JsonSerializer.Deserialize<List<JobOrderRoutingStepDto>>(jobOrder.RoutingStepsJson, new JsonSerializerOptions
                        {
                            PropertyNameCaseInsensitive = true
                        });
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error deserializing routing steps: {ex.Message}");
                    }
                }

                var result = new
                {
                    jobOrderID = jobOrder.JobOrderID,
                    jobOrderNumber = jobOrder.JobOrderNumber,
                    customerOrderID = jobOrder.CustomerOrderID,
                    customerOrderDetailID = jobOrder.CustomerOrderDetailID,
                    customerID = jobOrder.CustomerID,
                    customerName = jobOrder.CustomerName ?? "",
                    customerCode = jobOrder.CustomerCode ?? "",
                    jobNumber = jobOrder.JobNumber ?? "",
                    jobDesc = jobOrder.JobDesc ?? "",
                    partNo = jobOrder.PartNo ?? "",
                    partName = jobOrder.PartName ?? "",
                    qtyOrdered = jobOrder.QtyOrdered,
                    unit = jobOrder.Unit ?? "",
                    unitPrice = jobOrder.UnitPrice,
                    dueDate = jobOrder.DueDate,
                    jobPriority = jobOrder.JobPriority,
                    status = jobOrder.Status ?? "Draft",
                    tenantid = jobOrder.Tenantid,
                    userId = jobOrder.UserId,
                    userToken = jobOrder.UserToken,
                    orderDate = jobOrder.OrderDate,
                    attachments = attachments ?? new List<JobOrderAttachmentDto>(),
                    comments = comments ?? new List<JobOrderCommentDto>(),
                    routingSteps = routingSteps ?? new List<JobOrderRoutingStepDto>(),
                    drawingNumber = jobOrder.DrawingNumber ?? "",
                    drawingRevision = jobOrder.DrawingRevision ?? "",
                    jobTemplateId = jobOrder.JobTemplateId,
                    jobTemplateCode = jobOrder.JobTemplateCode ?? "",
                    jobTemplateRevision = jobOrder.JobTemplateRevision
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // Helper method to parse date strings in various formats
        private DateTime? ParseDate(string dateString)
        {
            if (string.IsNullOrWhiteSpace(dateString))
            {
                return null;
            }

            // Try parsing as ISO format first
            if (DateTime.TryParse(dateString, out DateTime isoDate))
            {
                return isoDate;
            }

            // Try parsing MM/DD/YY or MM/DD/YYYY format
            string[] formats = { "M/d/yy", "MM/dd/yy", "M/d/yyyy", "MM/dd/yyyy", "M/dd/yy", "MM/d/yy", "M/dd/yyyy", "MM/d/yyyy" };
            foreach (string format in formats)
            {
                if (DateTime.TryParseExact(dateString, format, CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTime parsedDate))
                {
                    return parsedDate;
                }
            }

            return null;
        }

        [HttpPost("SaveJobOrder")]
        public IActionResult SaveJobOrder([FromBody] JobOrderReq request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(new { error = "Request cannot be null" });
                }

                JobOrderMaster jobOrder;

                if (request.JobOrderID > 0)
                {
                    // Update existing job order
                    jobOrder = _context.JobOrderMaster
                        .FirstOrDefault(j => j.JobOrderID == request.JobOrderID && j.Tenantid == request.Tenantid);

                    if (jobOrder == null)
                    {
                        return NotFound(new { error = "Job order not found" });
                    }

                    jobOrder.ModifiedDate = DateTime.Now;
                }
                else
                {
                    // Get next Job Order Number
                    var existingJobOrders = _context.JobOrderMaster
                        .Where(j => j.Tenantid == request.Tenantid)
                        .ToList();

                    int nextJobOrderNumber;
                    if (existingJobOrders.Any())
                    {
                        var maxJobOrderNumber = existingJobOrders.Max(j => j.JobOrderNumber);
                        nextJobOrderNumber = Math.Max(1000, maxJobOrderNumber + 1);
                    }
                    else
                    {
                        nextJobOrderNumber = 1000;
                    }

                    // Create new job order
                    jobOrder = new JobOrderMaster
                    {
                        Tenantid = request.Tenantid,
                        OrderDate = ParseDate(request.OrderDate) ?? DateTime.Now,
                        UserId = request.UserId,
                        UserToken = request.UserToken,
                        JobOrderNumber = nextJobOrderNumber,
                        CreatedDate = DateTime.Now
                    };
                    _context.JobOrderMaster.Add(jobOrder);
                }

                // Parse dates from string format (MM/DD/YY or MM/DD/YYYY)
                DateTime? parsedDueDate = ParseDate(request.DueDate);
                DateTime? parsedOrderDate = ParseDate(request.OrderDate);

                // Update fields
                jobOrder.CustomerOrderID = request.CustomerOrderID;
                jobOrder.CustomerOrderDetailID = request.CustomerOrderDetailID;
                jobOrder.CustomerID = request.CustomerID;
                jobOrder.CustomerName = request.CustomerName ?? "";
                jobOrder.CustomerCode = request.CustomerCode ?? "";
                jobOrder.JobNumber = request.JobNumber ?? "";
                jobOrder.JobDesc = request.JobDesc ?? "";
                jobOrder.PartNo = request.PartNo ?? "";
                jobOrder.PartName = request.PartName ?? "";
                jobOrder.QtyOrdered = request.QtyOrdered;
                jobOrder.Unit = request.Unit ?? "";
                jobOrder.UnitPrice = request.UnitPrice;
                
                // Handle date parsing - use existing value if parsing fails, or default to today if new record
                if (parsedDueDate.HasValue)
                {
                    jobOrder.DueDate = parsedDueDate.Value;
                }
                else if (request.JobOrderID == 0)
                {
                    // New record - default to today if date is invalid
                    jobOrder.DueDate = DateTime.Now;
                }
                // For existing records, keep the existing DueDate if parsing fails
                
                if (parsedOrderDate.HasValue)
                {
                    jobOrder.OrderDate = parsedOrderDate.Value;
                }
                else if (request.JobOrderID == 0)
                {
                    // New record - default to today if date is invalid
                    jobOrder.OrderDate = DateTime.Now;
                }
                jobOrder.JobPriority = request.JobPriority;
                jobOrder.Status = request.Status ?? "Draft";
                jobOrder.DrawingNumber = request.DrawingNumber ?? "";
                jobOrder.DrawingRevision = request.DrawingRevision ?? "";
                jobOrder.JobTemplateId = request.JobTemplateId > 0 ? request.JobTemplateId : null;
                jobOrder.JobTemplateCode = request.JobTemplateId > 0 ? request.JobTemplateCode : null;
                jobOrder.JobTemplateRevision = request.JobTemplateId > 0 ? request.JobTemplateRevision : null;

                // Save attachments as JSON
                if (request.Attachments != null && request.Attachments.Count > 0)
                {
                    var attachmentOptions = new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                        PropertyNameCaseInsensitive = true,
                        WriteIndented = false
                    };
                    jobOrder.AttachmentsJson = JsonSerializer.Serialize(request.Attachments, attachmentOptions);
                }
                else
                {
                    jobOrder.AttachmentsJson = null;
                }

                // Save comments as JSON
                if (request.Comments != null && request.Comments.Count > 0)
                {
                    var commentOptions = new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                        WriteIndented = false
                    };
                    jobOrder.CommentsJson = JsonSerializer.Serialize(request.Comments, commentOptions);
                }
                else
                {
                    jobOrder.CommentsJson = null;
                }

                // Save routing steps as JSON
                if (request.RoutingSteps != null && request.RoutingSteps.Count > 0)
                {
                    var routingOptions = new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                        WriteIndented = false
                    };
                    jobOrder.RoutingStepsJson = JsonSerializer.Serialize(request.RoutingSteps, routingOptions);
                }
                else
                {
                    jobOrder.RoutingStepsJson = null;
                }

                _context.SaveChanges();

                return Ok(new { result = new { id = jobOrder.JobOrderID, message = "Job order saved successfully" } });
            }
            catch (Exception ex)
            {
                var errorMessage = ex.Message;
                if (ex.InnerException != null)
                {
                    errorMessage += " | Inner Exception: " + ex.InnerException.Message;
                }
                return StatusCode(500, new { error = errorMessage, stackTrace = ex.StackTrace });
            }
        }

        [HttpPost("CreateJobOrderFromOrderDetail")]
        public IActionResult CreateJobOrderFromOrderDetail([FromBody] CreateJobOrderFromDetailReq request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(new { error = "Request cannot be null" });
                }

                // Get the order detail
                var orderDetail = _context.CustomerOrderDetails
                    .FirstOrDefault(d => d.ID == request.OrderDetailID && d.OrderID == request.OrderID && d.Tenantid == request.Tenantid);

                if (orderDetail == null)
                {
                    return NotFound(new { error = "Order detail not found" });
                }

                // Get the parent order
                var order = _context.CustomerOrder
                    .FirstOrDefault(o => o.OrderID == request.OrderID && o.Tenantid == request.Tenantid);

                if (order == null)
                {
                    return NotFound(new { error = "Order not found" });
                }

                // Check if job order already exists for this detail
                var existingJobOrder = _context.JobOrderMaster
                    .FirstOrDefault(j => j.CustomerOrderDetailID == request.OrderDetailID && j.Tenantid == request.Tenantid);

                if (existingJobOrder != null)
                {
                    return BadRequest(new { error = "Job order already exists for this order detail" });
                }

                // Get next Job Order Number
                var existingJobOrders = _context.JobOrderMaster
                    .Where(j => j.Tenantid == request.Tenantid)
                    .ToList();

                int nextJobOrderNumber;
                if (existingJobOrders.Any())
                {
                    var maxJobOrderNumber = existingJobOrders.Max(j => j.JobOrderNumber);
                    nextJobOrderNumber = Math.Max(1000, maxJobOrderNumber + 1);
                }
                else
                {
                    nextJobOrderNumber = 1000;
                }

                // Create new job order from order detail
                var jobOrder = new JobOrderMaster
                {
                    JobOrderNumber = nextJobOrderNumber,
                    CustomerOrderID = request.OrderID,
                    CustomerOrderDetailID = request.OrderDetailID,
                    CustomerID = order.CustomerID,
                    CustomerName = order.CustomerName ?? "",
                    CustomerCode = order.customercode ?? "",
                    JobNumber = orderDetail.JobNumber ?? "",
                    JobDesc = orderDetail.JobDesc ?? "",
                    PartNo = orderDetail.PartNo ?? "",
                    PartName = orderDetail.partname ?? "",
                    QtyOrdered = orderDetail.QtyOrdered,
                    Unit = orderDetail.Unit ?? "",
                    UnitPrice = orderDetail.UnitPrice,
                    DueDate = orderDetail.DueDate,
                    JobPriority = orderDetail.JobPriority,
                    Status = "Draft",
                    Tenantid = request.Tenantid,
                    UserId = request.UserId,
                    UserToken = request.UserToken,
                    OrderDate = DateTime.Now,
                    CreatedDate = DateTime.Now
                };

                _context.JobOrderMaster.Add(jobOrder);
                _context.SaveChanges();

                return Ok(new { result = new { id = jobOrder.JobOrderID, message = "Job order created successfully" } });
            }
            catch (Exception ex)
            {
                var errorMessage = ex.Message;
                if (ex.InnerException != null)
                {
                    errorMessage += " | Inner Exception: " + ex.InnerException.Message;
                }
                return StatusCode(500, new { error = errorMessage, stackTrace = ex.StackTrace });
            }
        }

        [HttpGet("CheckJobOrderDeletionImpact")]
        public IActionResult CheckJobOrderDeletionImpact([FromQuery] int jobOrderId, [FromQuery] int tenantId)
        {
            try
            {
                var jobOrder = _context.JobOrderMaster
                    .FirstOrDefault(j => j.JobOrderID == jobOrderId && j.Tenantid == tenantId);

                if (jobOrder == null)
                {
                    return NotFound(new { error = "Job order not found" });
                }

                var impact = new DeletionImpactResult
                {
                    CanDelete = true,
                    BlockingReasons = new List<string>(),
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                // Check if job order is in progress or completed
                if (!string.IsNullOrEmpty(jobOrder.Status) && 
                    (jobOrder.Status.Equals("In Progress", StringComparison.OrdinalIgnoreCase) ||
                     jobOrder.Status.Equals("Completed", StringComparison.OrdinalIgnoreCase)))
                {
                    impact.Warnings.Add(
                        $"Job order status is '{jobOrder.Status}'. Deleting may affect production tracking."
                    );
                }

                // Check if related to customer order detail
                if (jobOrder.CustomerOrderDetailID > 0)
                {
                    var orderDetail = _context.CustomerOrderDetails
                        .FirstOrDefault(od => od.ID == jobOrder.CustomerOrderDetailID && od.Tenantid == tenantId);
                    
                    if (orderDetail != null)
                    {
                        impact.WillBeAffected.Add(new ImpactedEntity
                        {
                            EntityType = "Customer Order Detail",
                            Count = 1,
                            Description = $"The job order reference will be removed from order line item {orderDetail.ItemNo}"
                        });
                    }
                }

                impact.WillBeDeleted.Add(new ImpactedEntity
                {
                    EntityType = "Job Order",
                    Count = 1,
                    Description = "Job order will be permanently deleted"
                });

                impact.Warnings.Add("This action cannot be undone");

                return Ok(new { result = impact });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpDelete("DeleteJobOrder")]
        public IActionResult DeleteJobOrder([FromQuery] int jobOrderId, [FromQuery] int tenantId)
        {
            try
            {
                var jobOrder = _context.JobOrderMaster
                    .FirstOrDefault(j => j.JobOrderID == jobOrderId && j.Tenantid == tenantId);

                if (jobOrder == null)
                {
                    return NotFound(new { error = "Job order not found" });
                }

                _context.JobOrderMaster.Remove(jobOrder);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Job order deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }

    // DTOs
    public class JobOrderReq
    {
        public int JobOrderID { get; set; }
        public int JobOrderNumber { get; set; }
        public int CustomerOrderID { get; set; }
        public int CustomerOrderDetailID { get; set; }
        public int CustomerID { get; set; }
        public string CustomerName { get; set; }
        public string CustomerCode { get; set; }
        public string JobNumber { get; set; }
        public string JobDesc { get; set; }
        public string PartNo { get; set; }
        public string PartName { get; set; }
        public int QtyOrdered { get; set; }
        public string Unit { get; set; }
        public decimal UnitPrice { get; set; }
        public string DueDate { get; set; } // Accept as string, parse in controller
        public int JobPriority { get; set; }
        public string Status { get; set; }
        public int Tenantid { get; set; }
        public int UserId { get; set; }
        public int UserToken { get; set; }
        public string OrderDate { get; set; } // Accept as string, parse in controller
        public List<JobOrderAttachmentDto> Attachments { get; set; }
        public List<JobOrderCommentDto> Comments { get; set; }
        public List<JobOrderRoutingStepDto> RoutingSteps { get; set; }
        public string DrawingNumber { get; set; }
        public string DrawingRevision { get; set; }
        public int? JobTemplateId { get; set; }
        public string JobTemplateCode { get; set; }
        public int? JobTemplateRevision { get; set; }
    }

    public class CreateJobOrderFromDetailReq
    {
        public int OrderID { get; set; }
        public int OrderDetailID { get; set; }
        public int Tenantid { get; set; }
        public int UserId { get; set; }
        public int UserToken { get; set; }
    }

    public class JobOrderAttachmentDto
    {
        public int id { get; set; }
        public string name { get; set; }
        public int size { get; set; }
        public string fileUrl { get; set; }
    }

    public class JobOrderCommentDto
    {
        public int id { get; set; }
        public string text { get; set; }
        public string createdAt { get; set; }
        public string createdBy { get; set; }
    }

    public class JobOrderRoutingStepDto
    {
        public int id { get; set; }
        public int sequence { get; set; }
        public string processName { get; set; }
        public int? processId { get; set; }
        public string workstationName { get; set; }
        public int? workstationId { get; set; }
        public int? estimatedTime { get; set; }
        public string description { get; set; }
        public string status { get; set; }
        // Job tracking fields
        public int? qtyProduced { get; set; }
        public string technicianName { get; set; }
        public int? technicianId { get; set; }
        public string progressState { get; set; }
        public string startTime { get; set; }
        public int? elapsedTime { get; set; }
    }
}

