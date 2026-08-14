using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Utilities;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class JobOrderController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public JobOrderController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetJobOrders")]
        public IActionResult GetJobOrders([FromQuery] int tenantid, [FromQuery] int? locationId = null)
        {
            try
            {
                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                // Job orders inherit location from the linked customer order.
                var query =
                    from j in _context.JobOrderMaster.AsNoTracking()
                    where j.Tenantid == tenantid
                    join o in _context.CustomerOrder.AsNoTracking().Where(x => x.Tenantid == tenantid)
                        on j.CustomerOrderID equals o.OrderID into orderGroup
                    from o in orderGroup.DefaultIfEmpty()
                    select new
                    {
                        Job = j,
                        OrderLocationId = o != null ? o.locationId : 0
                    };

                if (filterLocationId.HasValue)
                {
                    query = query.Where(x => x.OrderLocationId == filterLocationId.Value);
                }

                var jobOrders = query
                    .OrderByDescending(x => x.Job.OrderDate)
                    .Select(x => new
                    {
                        jobOrderID = x.Job.JobOrderID,
                        jobOrderNumber = x.Job.JobOrderNumber,
                        customerOrderID = x.Job.CustomerOrderID,
                        customerOrderDetailID = x.Job.CustomerOrderDetailID,
                        customerID = x.Job.CustomerID,
                        customerName = x.Job.CustomerName ?? "",
                        customerCode = x.Job.CustomerCode ?? "",
                        partNo = x.Job.PartNo ?? "",
                        partName = x.Job.PartName ?? "",
                        qtyOrdered = x.Job.QtyOrdered,
                        unit = x.Job.Unit ?? "",
                        unitPrice = x.Job.UnitPrice,
                        dueDate = x.Job.DueDate,
                        jobNumber = x.Job.JobNumber ?? "",
                        jobDesc = x.Job.JobDesc ?? "",
                        jobPriority = x.Job.JobPriority,
                        status = x.Job.Status ?? "Draft",
                        orderDate = x.Job.OrderDate,
                        locationId = x.OrderLocationId,
                        routingStepsJson = x.Job.RoutingStepsJson
                    })
                    .ToList()
                    .Select(x => new
                    {
                        x.jobOrderID,
                        x.jobOrderNumber,
                        x.customerOrderID,
                        x.customerOrderDetailID,
                        x.customerID,
                        x.customerName,
                        x.customerCode,
                        x.partNo,
                        x.partName,
                        x.qtyOrdered,
                        x.unit,
                        x.unitPrice,
                        // Date-only strings avoid timezone off-by-one on the client
                        dueDate = x.dueDate.ToString("yyyy-MM-dd"),
                        x.jobNumber,
                        x.jobDesc,
                        x.jobPriority,
                        x.status,
                        orderDate = x.orderDate.ToString("yyyy-MM-dd"),
                        x.locationId,
                        routingSteps = ToRoutingProgress(x.routingStepsJson)
                    })
                    .ToList();

                return Ok(new { result = jobOrders });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Lightweight map of job orders for a single customer order (avoids loading all tenant JOs).
        /// </summary>
        [HttpGet("GetJobOrdersByCustomerOrder")]
        public IActionResult GetJobOrdersByCustomerOrder([FromQuery] int orderId, [FromQuery] int tenantId)
        {
            try
            {
                var jobOrders = _context.JobOrderMaster
                    .AsNoTracking()
                    .Where(j => j.Tenantid == tenantId && j.CustomerOrderID == orderId)
                    .Select(j => new
                    {
                        jobOrderID = j.JobOrderID,
                        customerOrderDetailID = j.CustomerOrderDetailID,
                        status = j.Status ?? "Draft"
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
                    // Date-only strings avoid timezone off-by-one on the client
                    dueDate = jobOrder.DueDate.ToString("yyyy-MM-dd"),
                    jobPriority = jobOrder.JobPriority,
                    status = jobOrder.Status ?? "Draft",
                    tenantid = jobOrder.Tenantid,
                    userId = jobOrder.UserId,
                    userToken = jobOrder.UserToken,
                    orderDate = jobOrder.OrderDate.ToString("yyyy-MM-dd"),
                    attachments = attachments ?? new List<JobOrderAttachmentDto>(),
                    comments = comments ?? new List<JobOrderCommentDto>(),
                    routingSteps = routingSteps ?? new List<JobOrderRoutingStepDto>(),
                    drawingNumber = jobOrder.DrawingNumber ?? "",
                    drawingRevision = jobOrder.DrawingRevision ?? "",
                    jobTemplateId = jobOrder.JobTemplateId,
                    jobTemplateCode = jobOrder.JobTemplateCode ?? "",
                    jobTemplateRevision = jobOrder.JobTemplateRevision,
                    enableJobTracking = jobOrder.EnableJobTracking
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // Helper method to parse date strings in various formats (date-only, no timezone shift)
        private DateTime? ParseDate(string dateString)
        {
            if (string.IsNullOrWhiteSpace(dateString))
            {
                return null;
            }

            string[] formats =
            {
                "yyyy-MM-dd",
                "yyyy-M-d",
                "M/d/yy", "MM/dd/yy", "M/d/yyyy", "MM/dd/yyyy",
                "M/dd/yy", "MM/d/yy", "M/dd/yyyy", "MM/d/yyyy"
            };
            foreach (string format in formats)
            {
                if (DateTime.TryParseExact(dateString.Trim(), format, CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTime parsedDate))
                {
                    return parsedDate.Date;
                }
            }

            // Fallback: take calendar date from ISO / DateTime strings (ignore time/zone)
            if (DateTime.TryParse(dateString, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out DateTime isoDate))
            {
                return isoDate.Date;
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
                jobOrder.DrawingNumber = request.DrawingNumber ?? "";
                jobOrder.DrawingRevision = request.DrawingRevision ?? "";
                jobOrder.JobTemplateId = request.JobTemplateId > 0 ? request.JobTemplateId : null;
                jobOrder.JobTemplateCode = request.JobTemplateId > 0 ? request.JobTemplateCode : null;
                jobOrder.JobTemplateRevision = request.JobTemplateId > 0 ? request.JobTemplateRevision : null;

                // Omit-safe: PWA step saves may not send EnableJobTracking; do not wipe office Track flag.
                if (request.EnableJobTracking.HasValue)
                {
                    jobOrder.EnableJobTracking = request.EnableJobTracking.Value;
                }
                else if (request.JobOrderID == 0)
                {
                    jobOrder.EnableJobTracking = false;
                }

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

                // Save routing steps as JSON; commit live wall-clock elapsed for running steps.
                if (request.RoutingSteps != null && request.RoutingSteps.Count > 0)
                {
                    // Stale step saves (Start/Pause/NCR) must not wipe notes added in another request.
                    JobOrderTrackingHelper.PreserveStepAnnotations(
                        jobOrder.RoutingStepsJson,
                        request.RoutingSteps);
                    JobOrderTrackingHelper.CommitLiveElapsed(request.RoutingSteps, DateTime.UtcNow);
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

                // Keep job Status aligned with routing-step progress (shared office + PWA rule).
                jobOrder.Status = JobOrderTrackingHelper.DeriveJobStatus(
                    request.Status ?? jobOrder.Status ?? "Draft",
                    request.RoutingSteps);

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
                    DueDate = orderDetail.DueDate.Date,
                    JobPriority = orderDetail.JobPriority,
                    Status = "Draft",
                    Tenantid = request.Tenantid,
                    UserId = request.UserId,
                    UserToken = request.UserToken,
                    OrderDate = DateTime.Now.Date,
                    EnableJobTracking = false,
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

        /// <summary>
        /// Slim routing fields for job listing progress (avoids per-job GetJobOrderById).
        /// </summary>
        private static List<JobOrderRoutingProgressDto> ToRoutingProgress(string routingStepsJson)
        {
            if (string.IsNullOrWhiteSpace(routingStepsJson))
            {
                return new List<JobOrderRoutingProgressDto>();
            }

            try
            {
                var steps = JsonSerializer.Deserialize<List<JobOrderRoutingStepDto>>(
                    routingStepsJson,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (steps == null || steps.Count == 0)
                {
                    return new List<JobOrderRoutingProgressDto>();
                }

                return steps
                    .OrderBy(s => s.sequence)
                    .Select(s => new JobOrderRoutingProgressDto
                    {
                        id = s.id,
                        sequence = s.sequence,
                        processName = s.processName ?? "",
                        status = s.status ?? "",
                        progressState = string.IsNullOrWhiteSpace(s.progressState) ? "idle" : s.progressState,
                        qtyProduced = s.qtyProduced ?? 0
                    })
                    .ToList();
            }
            catch
            {
                return new List<JobOrderRoutingProgressDto>();
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
        /// <summary>
        /// Nullable so clients that omit the field (e.g. PWA step actions) do not reset Track to false.
        /// </summary>
        public bool? EnableJobTracking { get; set; }
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

    public class JobOrderRoutingProgressDto
    {
        public int id { get; set; }
        public int sequence { get; set; }
        public string processName { get; set; }
        public string status { get; set; }
        public string progressState { get; set; }
        public int qtyProduced { get; set; }
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
        /// <summary>Legacy committed minutes (kept in sync with elapsedSeconds).</summary>
        public int? elapsedTime { get; set; }
        /// <summary>Committed elapsed seconds (preferred precision).</summary>
        public int? elapsedSeconds { get; set; }
        /// <summary>Reason recorded when the step was last paused.</summary>
        public string pauseReason { get; set; }
        /// <summary>Inline shop notes for this operation.</summary>
        public List<JobOrderStepNoteDto> notes { get; set; }
        /// <summary>Linked NCR pointers created from this step.</summary>
        public List<JobOrderStepNcrFlagDto> ncrFlags { get; set; }
        /// <summary>Stable scan payload for shop-floor QR/barcode (cimmple://jo/{id}/step/{stepId}).</summary>
        public string scanCode { get; set; }
    }

    public class JobOrderStepNoteDto
    {
        public long id { get; set; }
        public string text { get; set; }
        public string createdAt { get; set; }
        public string createdBy { get; set; }
    }

    public class JobOrderStepNcrFlagDto
    {
        public int ncrId { get; set; }
        public string ncrNumber { get; set; }
        public string status { get; set; }
    }
}

