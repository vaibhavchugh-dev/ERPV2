using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Services;
using CimmpleAPI.Utilities;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class JobOrderController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly InventoryService _inventoryService;
        private readonly IConfiguration _configuration;
        private readonly NotificationService _notificationService;

        public JobOrderController(
            CimmpleDbContext context,
            InventoryService inventoryService,
            IConfiguration configuration,
            NotificationService notificationService)
        {
            _context = context;
            _inventoryService = inventoryService;
            _configuration = configuration;
            _notificationService = notificationService;
        }

        [HttpGet("GetJobOrders")]
        public async Task<IActionResult> GetJobOrders([FromQuery] int tenantid, [FromQuery] int? locationId = null)
        {
            try
            {
                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrictToLocationIds))
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
                        OrderLocationId = o != null ? o.locationId : 0,
                        CustomerPONumber = o != null ? o.PONumber : 0
                    };

                if (filterLocationId.HasValue)
                {
                    query = query.Where(x => x.OrderLocationId == filterLocationId.Value);
                }
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    query = allowed.Count == 0
                        ? query.Where(x => false)
                        : query.Where(x => allowed.Contains(x.OrderLocationId));
                }

                var rows = await query
                    .OrderByDescending(x => x.Job.OrderDate)
                    .Select(x => new
                    {
                        jobOrderID = x.Job.JobOrderID,
                        jobOrderNumber = x.Job.JobOrderNumber,
                        customerOrderID = x.Job.CustomerOrderID,
                        customerPONumber = x.CustomerPONumber > 0 ? x.CustomerPONumber : x.Job.CustomerOrderID,
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
                    .ToListAsync();

                var shortFlags = await ComputeShortMaterialFlagsAsync(
                    tenantid,
                    rows.Select(x => (x.jobOrderID, x.jobOrderNumber, x.status, x.locationId)).ToList());

                var jobOrders = rows
                    .Select(x => new
                    {
                        x.jobOrderID,
                        x.jobOrderNumber,
                        x.customerOrderID,
                        x.customerPONumber,
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
                        routingSteps = ToRoutingProgress(x.routingStepsJson),
                        isShortMaterial = shortFlags.GetValueOrDefault(x.jobOrderID)
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
        public async Task<IActionResult> GetJobOrderById([FromQuery] int jobOrderId, [FromQuery] int tenantId)
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

                var material = await BuildMaterialRequirementDtosAsync(jobOrder);

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
                    enableJobTracking = jobOrder.EnableJobTracking,
                    materialRequirements = material.Lines,
                    isShortMaterial = material.IsShortMaterial
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
        public async Task<IActionResult> SaveJobOrder([FromBody] JobOrderReq request)
        {
            await using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                if (request == null)
                {
                    return BadRequest(new { error = "Request cannot be null" });
                }

                JobOrderMaster jobOrder;
                var previousStatus = "Draft";

                if (request.JobOrderID > 0)
                {
                    // Update existing job order
                    jobOrder = _context.JobOrderMaster
                        .FirstOrDefault(j => j.JobOrderID == request.JobOrderID && j.Tenantid == request.Tenantid);

                    if (jobOrder == null)
                    {
                        return NotFound(new { error = "Job order not found" });
                    }

                    previousStatus = jobOrder.Status ?? "Draft";
                    jobOrder.ModifiedDate = DateTime.Now;
                }
                else
                {
                    jobOrder = new JobOrderMaster
                    {
                        Tenantid = request.Tenantid,
                        OrderDate = ParseDate(request.OrderDate) ?? DateTime.Now,
                        UserId = request.UserId,
                        UserToken = request.UserToken,
                        JobOrderNumber = AllocateNextJobOrderNumber(request.Tenantid),
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

                // Delete Azure blobs for attachments removed in the UI (JSON-only storage).
                if (request.DeletedAttachmentIds != null && request.DeletedAttachmentIds.Count > 0)
                {
                    await ProcessDeletedJobOrderAttachments(
                        jobOrder,
                        request.Tenantid,
                        request.DeletedAttachmentIds);
                }

                // Save attachments as JSON (persisted metadata; new blobs uploaded via JobOrderSaveFile).
                // Omit-safe: null Attachments means leave existing JSON alone (UI may upload next).
                if (request.Attachments != null)
                {
                    if (request.Attachments.Count > 0)
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
                }

                // Save comments as JSON
                List<CommentMentionSource>? joMentions = null;
                if (request.Comments != null && request.Comments.Count > 0)
                {
                    joMentions = CommentMentionHelper.FromDtos(request.Comments);
                    jobOrder.CommentsJson = CommentMentionHelper.SerializeDtosForStorage(request.Comments);
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

                if (joMentions != null && jobOrder.JobOrderID > 0)
                {
                    var label = !string.IsNullOrWhiteSpace(jobOrder.JobNumber)
                        ? $"Job Order {jobOrder.JobNumber}"
                        : $"Job Order #{jobOrder.JobOrderID}";
                    await CommentMentionHelper.NotifyAsync(
                        _notificationService,
                        jobOrder.Tenantid,
                        GetUserId(),
                        joMentions,
                        "JobOrder",
                        jobOrder.JobOrderID,
                        label,
                        $"/job-orders?open={jobOrder.JobOrderID}");
                }

                if (request.MaterialRequirements != null)
                {
                    await ReplaceJobMaterialRequirementsAsync(jobOrder, request.MaterialRequirements);
                    await _context.SaveChangesAsync();
                }

                var inventoryError = await ApplyFinishedGoodsInventoryAsync(
                    jobOrder, previousStatus, request);
                if (!string.IsNullOrEmpty(inventoryError))
                {
                    await transaction.RollbackAsync();
                    return BadRequest(new { error = inventoryError });
                }

                if (string.Equals(jobOrder.Status, "Completed", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(jobOrder.Status, "Cancelled", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(jobOrder.Status, "Shipped", StringComparison.OrdinalIgnoreCase))
                {
                    await _inventoryService.ReleaseOpenReservationsForJobInTransactionAsync(
                        jobOrder.Tenantid, jobOrder.JobOrderID);
                    await _context.SaveChangesAsync();
                }

                await transaction.CommitAsync();

                if (DomainNotificationHelper.StatusBecame(previousStatus, jobOrder.Status, "Completed")
                    && jobOrder.JobOrderID > 0)
                {
                    var label = !string.IsNullOrWhiteSpace(jobOrder.JobNumber)
                        ? jobOrder.JobNumber!
                        : $"Job #{jobOrder.JobOrderID}";
                    await DomainNotificationHelper.NotifyUserAsync(
                        _notificationService,
                        jobOrder.Tenantid,
                        jobOrder.UserId,
                        GetUserId(),
                        NotificationService.TypeJobOrderCompleted,
                        $"Job {label} completed",
                        $"Job order {label} was marked Completed.",
                        "JobOrder",
                        jobOrder.JobOrderID,
                        $"/job-orders?open={jobOrder.JobOrderID}");
                }

                return Ok(new { result = new { id = jobOrder.JobOrderID, message = "Job order saved successfully" } });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
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

                // Default JO qty to remaining demand (ordered − already shipped), not the full line.
                var remainingQty = Math.Max(0, orderDetail.QtyOrdered - orderDetail.ShippedQty);
                if (remainingQty <= 0)
                {
                    return BadRequest(new { error = "Nothing left to make — this order line is already fully shipped." });
                }

                var jobOrder = new JobOrderMaster
                {
                    JobOrderNumber = AllocateNextJobOrderNumber(request.Tenantid),
                    CustomerOrderID = request.OrderID,
                    CustomerOrderDetailID = request.OrderDetailID,
                    CustomerID = order.CustomerID,
                    CustomerName = order.CustomerName ?? "",
                    CustomerCode = order.customercode ?? "",
                    JobNumber = orderDetail.JobNumber ?? "",
                    JobDesc = orderDetail.JobDesc ?? "",
                    PartNo = orderDetail.PartNo ?? "",
                    PartName = orderDetail.partname ?? "",
                    QtyOrdered = remainingQty,
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
        public async Task<IActionResult> CheckJobOrderDeletionImpact([FromQuery] int jobOrderId, [FromQuery] int tenantId)
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

                var fgOnHand = await NetFinishedGoodsQtyAsync(tenantId, jobOrderId);
                if (fgOnHand > 0)
                {
                    impact.CanDelete = false;
                    impact.BlockingReasons.Add(
                        "Cannot delete while finished goods remain in inventory. Reopen the job to reverse stock first.");
                }

                // Check if job order is in progress or completed
                if (!string.IsNullOrEmpty(jobOrder.Status) && 
                    (jobOrder.Status.Equals("In Progress", StringComparison.OrdinalIgnoreCase) ||
                     jobOrder.Status.Equals("Completed", StringComparison.OrdinalIgnoreCase)))
                {
                    impact.Warnings.Add(
                        $"Job order status is '{jobOrder.Status}'. Deleting will not reuse this job's unique ID."
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

        /// <summary>
        /// Upload job order attachments to Azure Blob Storage and update JobOrderMaster.AttachmentsJson.
        /// Requires an existing job order (jobOrderId). No separate attachment table — metadata lives in JSON.
        /// </summary>
        [HttpPost("JobOrderSaveFile")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> JobOrderSaveFile()
        {
            try
            {
                var form = await Request.ReadFormAsync();
                var files = form.Files;
                if (files == null || files.Count == 0)
                {
                    return BadRequest(new { error = "At least one file is required" });
                }

                if (!form.ContainsKey("jobOrderId") && !form.ContainsKey("JobOrderId")
                    && !form.ContainsKey("orderId") && !form.ContainsKey("OrderId")
                    && !form.ContainsKey("formField"))
                {
                    return BadRequest(new { error = "jobOrderId or formField is required" });
                }

                int jobOrderId = 0;
                int tenantId = GetTenantId();
                int createdBy = GetUserId() ?? 0;

                if (form.ContainsKey("formField") && !string.IsNullOrWhiteSpace(form["formField"]))
                {
                    var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    var request = JsonSerializer.Deserialize<JobOrderAttachmentUploadContext>(form["formField"]!, options);
                    if (request != null)
                    {
                        if (request.JobOrderId > 0) jobOrderId = request.JobOrderId;
                        else if (request.OrderId > 0) jobOrderId = request.OrderId;
                        if (request.TenantId > 0) tenantId = request.TenantId;
                    }
                }

                if (jobOrderId <= 0)
                {
                    var idValue = form.ContainsKey("jobOrderId") ? form["jobOrderId"].ToString()
                        : form.ContainsKey("JobOrderId") ? form["JobOrderId"].ToString()
                        : form.ContainsKey("orderId") ? form["orderId"].ToString()
                        : form.ContainsKey("OrderId") ? form["OrderId"].ToString() : "";
                    int.TryParse(idValue, out jobOrderId);
                }

                if (form.ContainsKey("tenantId") && int.TryParse(form["tenantId"], out var formTenant) && formTenant > 0)
                {
                    tenantId = formTenant;
                }

                if (jobOrderId <= 0)
                {
                    return BadRequest(new { error = "A saved job order (jobOrderId) is required before uploading attachments" });
                }

                if (tenantId <= 0)
                {
                    return BadRequest(new { error = "TenantId is required" });
                }

                var jobOrder = _context.JobOrderMaster
                    .FirstOrDefault(j => j.JobOrderID == jobOrderId && j.Tenantid == tenantId);
                if (jobOrder == null)
                {
                    return NotFound(new { error = "Job order not found" });
                }

                var jsonOptions = new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                    PropertyNameCaseInsensitive = true
                };

                var existing = new List<JobOrderAttachmentDto>();
                if (!string.IsNullOrEmpty(jobOrder.AttachmentsJson))
                {
                    try
                    {
                        existing = JsonSerializer.Deserialize<List<JobOrderAttachmentDto>>(
                                       jobOrder.AttachmentsJson, jsonOptions)
                                   ?? new List<JobOrderAttachmentDto>();
                    }
                    catch
                    {
                        existing = new List<JobOrderAttachmentDto>();
                    }
                }

                int nextFileUniqueNo = existing.Count > 0
                    ? Math.Max(existing.Max(a => a.FileUniqueno), existing.Max(a => a.Id)) + 1
                    : 1;
                if (nextFileUniqueNo <= 0) nextFileUniqueNo = 1;

                var uploaded = new List<JobOrderAttachmentDto>();

                foreach (var file in files)
                {
                    if (file == null || file.Length <= 0)
                    {
                        continue;
                    }

                    var ext = Path.GetExtension(file.FileName)?.ToLowerInvariant() ?? "";
                    var displayName = Path.GetFileName(file.FileName);
                    var blobName = $"{nextFileUniqueNo}{ext}";

                    var fileInfo = ModuleFileStorage.CreateFileInfo(
                        tenantId,
                        ModuleFileStorage.JobOrdersFolder,
                        blobName,
                        createdBy);

                    var uploadedOk = await ModuleFileStorage.UploadAsync(_context, _configuration, file, fileInfo);
                    if (!uploadedOk)
                    {
                        var connMissing = string.IsNullOrEmpty(
                            _configuration["AzureConnection:storageConnectionString"]
                            ?? _configuration["AzureConnString"]);
                        return StatusCode(500, new
                        {
                            error = connMissing
                                ? $"Failed to upload file '{displayName}' to Azure Storage. Configure AzureConnection:storageConnectionString (or AzureConnString / gcwConfig)."
                                : $"Failed to upload file '{displayName}' to Azure Storage"
                        });
                    }

                    var dto = new JobOrderAttachmentDto
                    {
                        Id = nextFileUniqueNo,
                        Name = displayName,
                        Size = file.Length > int.MaxValue ? int.MaxValue : (int)file.Length,
                        FileUrl = blobName,
                        FileUniqueno = nextFileUniqueNo,
                        UploadFile = blobName,
                        PageNo = "0",
                        CreatedBy = createdBy
                    };
                    existing.Add(dto);
                    uploaded.Add(dto);
                    nextFileUniqueNo++;
                }

                var writeOptions = new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                    PropertyNameCaseInsensitive = true,
                    WriteIndented = false
                };
                jobOrder.AttachmentsJson = existing.Count > 0
                    ? JsonSerializer.Serialize(existing, writeOptions)
                    : null;
                _context.SaveChanges();

                return Ok(new
                {
                    result = new
                    {
                        jobOrderId,
                        attachments = uploaded,
                        message = "Files uploaded successfully"
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        /// <summary>
        /// Single-file binary download for job order attachments (from AttachmentsJson + Azure).
        /// </summary>
        [HttpGet("JobOrderGetFile")]
        public IActionResult JobOrderGetFile(
            [FromQuery] int jobOrderId,
            [FromQuery] int fileUniqueno,
            [FromQuery] int tenantId = 0,
            [FromQuery] bool download = false)
        {
            try
            {
                if (jobOrderId <= 0 || fileUniqueno <= 0)
                {
                    return BadRequest(new { error = "jobOrderId and fileUniqueno are required" });
                }

                if (tenantId <= 0) tenantId = GetTenantId();

                var jobOrder = _context.JobOrderMaster
                    .AsNoTracking()
                    .FirstOrDefault(j => j.JobOrderID == jobOrderId && j.Tenantid == tenantId);
                if (jobOrder == null || string.IsNullOrEmpty(jobOrder.AttachmentsJson))
                {
                    return NotFound(new { error = "Attachment not found" });
                }

                List<JobOrderAttachmentDto>? attachments;
                try
                {
                    var options = new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                        PropertyNameCaseInsensitive = true
                    };
                    attachments = JsonSerializer.Deserialize<List<JobOrderAttachmentDto>>(
                        jobOrder.AttachmentsJson, options);
                }
                catch
                {
                    return NotFound(new { error = "Attachment not found" });
                }

                var attachment = attachments?.FirstOrDefault(a =>
                    a.FileUniqueno == fileUniqueno || a.Id == fileUniqueno);
                if (attachment == null || string.IsNullOrEmpty(attachment.UploadFile ?? attachment.FileUrl))
                {
                    return NotFound(new { error = "Attachment not found" });
                }

                var blobName = !string.IsNullOrEmpty(attachment.UploadFile)
                    ? attachment.UploadFile
                    : attachment.FileUrl;

                var fileInfo = ModuleFileStorage.CreateFileInfo(
                    tenantId,
                    ModuleFileStorage.JobOrdersFolder,
                    blobName);

                var bytes = ModuleFileStorage.DownloadBytes(_context, _configuration, fileInfo);
                if (bytes == null || bytes.Length == 0)
                {
                    return NotFound(new { error = "File not found in Azure Storage" });
                }

                var contentType = ModuleFileStorage.GetContentType(attachment.Name ?? blobName);
                var fileName = ModuleFileStorage.SanitizeFileName(attachment.Name);

                if (download)
                {
                    return File(bytes, contentType, fileName);
                }

                Response.Headers["Content-Disposition"] = $"inline; filename=\"{fileName}\"";
                Response.Headers["X-Attachment-Id"] = attachment.Id.ToString();
                Response.Headers["X-File-Name"] = fileName;
                return File(bytes, contentType);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private async Task ProcessDeletedJobOrderAttachments(
            JobOrderMaster jobOrder,
            int tenantId,
            List<int> deletedAttachmentIds)
        {
            if (deletedAttachmentIds == null || deletedAttachmentIds.Count == 0
                || string.IsNullOrEmpty(jobOrder.AttachmentsJson))
            {
                return;
            }

            List<JobOrderAttachmentDto>? existing;
            try
            {
                var options = new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                    PropertyNameCaseInsensitive = true
                };
                existing = JsonSerializer.Deserialize<List<JobOrderAttachmentDto>>(
                    jobOrder.AttachmentsJson, options);
            }
            catch
            {
                return;
            }

            if (existing == null || existing.Count == 0)
            {
                return;
            }

            var idSet = deletedAttachmentIds.ToHashSet();
            var toDelete = existing
                .Where(a => idSet.Contains(a.Id) || idSet.Contains(a.FileUniqueno))
                .ToList();

            foreach (var attachment in toDelete)
            {
                var blobName = !string.IsNullOrEmpty(attachment.UploadFile)
                    ? attachment.UploadFile
                    : attachment.FileUrl;
                if (string.IsNullOrEmpty(blobName))
                {
                    continue;
                }

                var fileInfo = ModuleFileStorage.CreateFileInfo(
                    tenantId,
                    ModuleFileStorage.JobOrdersFolder,
                    blobName);
                await ModuleFileStorage.DeleteAsync(_context, _configuration, fileInfo);
            }
        }

        [HttpDelete("DeleteJobOrder")]
        public async Task<IActionResult> DeleteJobOrder([FromQuery] int jobOrderId, [FromQuery] int tenantId)
        {
            try
            {
                var jobOrder = _context.JobOrderMaster
                    .FirstOrDefault(j => j.JobOrderID == jobOrderId && j.Tenantid == tenantId);

                if (jobOrder == null)
                {
                    return NotFound(new { error = "Job order not found" });
                }

                var fgOnHand = await NetFinishedGoodsQtyAsync(tenantId, jobOrderId);
                if (fgOnHand > 0)
                {
                    return BadRequest(new
                    {
                        error = $"Cannot delete job order while {fgOnHand:0.##} finished goods remain in inventory. Reopen the job to reverse stock first."
                    });
                }

                await _inventoryService.ReleaseOpenReservationsForJobInTransactionAsync(tenantId, jobOrderId);
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

        private static bool IsCompletedStatus(string? status)
        {
            return string.Equals(status, "Completed", StringComparison.OrdinalIgnoreCase);
        }

        private static string JobInventoryLabel(JobOrderMaster job)
        {
            var n = job.JobOrderNumber;
            if (n > 0 && n < 1000)
                n += 999;
            return n > 0 ? $"JO#{n}" : (string.IsNullOrWhiteSpace(job.JobNumber) ? "job" : job.JobNumber.Trim());
        }

        private decimal ResolveFinishedQty(JobOrderMaster job, JobOrderReq request)
        {
            if (request.RoutingSteps != null && request.RoutingSteps.Count > 0)
            {
                var last = request.RoutingSteps.OrderBy(s => s.sequence).Last();
                if (last.qtyProduced.HasValue && last.qtyProduced.Value > 0)
                    return last.qtyProduced.Value;
            }
            return job.QtyOrdered > 0 ? job.QtyOrdered : 0;
        }

        private async Task<int?> ResolveJobInventoryLocationAsync(JobOrderMaster job)
        {
            if (job.CustomerOrderID > 0)
            {
                var orderLocationId = await _context.CustomerOrder
                    .AsNoTracking()
                    .Where(o => o.OrderID == job.CustomerOrderID && o.Tenantid == job.Tenantid)
                    .Select(o => o.locationId)
                    .FirstOrDefaultAsync();
                if (orderLocationId > 0)
                    return orderLocationId;
            }

            if (job.UserId > 0)
            {
                var userLocationId = await _context.UserDetails
                    .AsNoTracking()
                    .Where(u => u.User_UniqueID == job.UserId && u.TenantID == job.Tenantid)
                    .Select(u => u.DefaultLocationId)
                    .FirstOrDefaultAsync();
                if (userLocationId.HasValue && userLocationId.Value > 0)
                    return userLocationId.Value;
            }

            var anyLocationId = await _context.Locations
                .AsNoTracking()
                .Where(l => l.TenantId == job.Tenantid)
                .OrderBy(l => l.LocationId)
                .Select(l => l.LocationId)
                .FirstOrDefaultAsync();
            return anyLocationId > 0 ? anyLocationId : null;
        }

        private async Task ReplaceJobMaterialRequirementsAsync(
            JobOrderMaster job,
            List<JobMaterialRequirementReq> lines)
        {
            var existing = await _context.JobMaterialRequirement
                .Where(m => m.JobOrderId == job.JobOrderID && m.Tenantid == job.Tenantid)
                .ToListAsync();
            _context.JobMaterialRequirement.RemoveRange(existing);

            var seq = 10;
            foreach (var line in lines)
            {
                var productId = line.ProductId.HasValue && line.ProductId.Value > 0 ? line.ProductId : null;
                var rawMaterialId = line.RawMaterialId.HasValue && line.RawMaterialId.Value > 0 ? line.RawMaterialId : null;
                if (productId.HasValue && rawMaterialId.HasValue)
                    rawMaterialId = null;
                if (!productId.HasValue && !rawMaterialId.HasValue)
                    continue;
                if (line.QuantityNeeded <= 0)
                    continue;

                _context.JobMaterialRequirement.Add(new JobMaterialRequirement
                {
                    JobOrderId = job.JobOrderID,
                    Tenantid = job.Tenantid,
                    SequenceNumber = line.SequenceNumber > 0 ? line.SequenceNumber : seq,
                    ProductId = productId,
                    RawMaterialId = rawMaterialId,
                    QuantityNeeded = line.QuantityNeeded,
                    Notes = string.IsNullOrWhiteSpace(line.Notes) ? null : line.Notes.Trim()
                });
                seq += 10;
            }
        }

        private async Task<(object Lines, bool IsShortMaterial)> BuildMaterialRequirementDtosAsync(JobOrderMaster job)
        {
            var rows = await _context.JobMaterialRequirement
                .AsNoTracking()
                .Include(m => m.Product)
                .Include(m => m.RawMaterial)
                .Where(m => m.JobOrderId == job.JobOrderID && m.Tenantid == job.Tenantid)
                .OrderBy(m => m.SequenceNumber)
                .ThenBy(m => m.Id)
                .ToListAsync();

            if (rows.Count == 0)
                return (new List<object>(), false);

            var locationId = await ResolveJobInventoryLocationAsync(job);
            string? locationName = null;
            if (locationId.HasValue)
            {
                locationName = await _context.Locations
                    .AsNoTracking()
                    .Where(l => l.LocationId == locationId.Value)
                    .Select(l => l.Name)
                    .FirstOrDefaultAsync();
            }

            var refIds = JobMaterialRefIds(job.JobOrderID, job.JobOrderNumber);

            var productIds = rows.Where(r => r.ProductId.HasValue).Select(r => r.ProductId!.Value).Distinct().ToList();
            var rawIds = rows.Where(r => r.RawMaterialId.HasValue).Select(r => r.RawMaterialId!.Value).Distinct().ToList();

            var remnantChildren = rawIds.Count == 0
                ? new List<(int Id, int ParentId)>()
                : (await _context.RawMaterialMaster
                    .AsNoTracking()
                    .Where(r => r.Tenantid == job.Tenantid
                        && r.IsRemnant
                        && r.ParentRawMaterialId.HasValue
                        && rawIds.Contains(r.ParentRawMaterialId.Value))
                    .Select(r => new { r.Id, ParentId = r.ParentRawMaterialId!.Value })
                    .ToListAsync())
                    .Select(r => (r.Id, r.ParentId))
                    .ToList();
            var familyRawIds = rawIds.Concat(remnantChildren.Select(r => r.Id)).Distinct().ToList();

            var balances = await _context.InventoryBalance
                .AsNoTracking()
                .Where(b => b.Tenantid == job.Tenantid
                    && (!locationId.HasValue || b.LocationId == locationId.Value)
                    && (
                        (b.ProductId.HasValue && productIds.Contains(b.ProductId.Value))
                        || (b.RawMaterialId.HasValue && familyRawIds.Contains(b.RawMaterialId.Value))
                    ))
                .ToListAsync();

            var reservations = await _context.InventoryReservation
                .AsNoTracking()
                .Where(r => r.Tenantid == job.Tenantid
                    && r.ReferenceType == "JobOrder"
                    && refIds.Contains(r.ReferenceId)
                    && r.Quantity > 0)
                .ToListAsync();

            var issues = await _context.InventoryTransaction
                .AsNoTracking()
                .Where(t => t.Tenantid == job.Tenantid
                    && t.ReferenceType == "JobOrder"
                    && t.ReferenceId.HasValue
                    && refIds.Contains(t.ReferenceId.Value)
                    && t.TransactionTypeId == 2)
                .ToListAsync();

            HashSet<int> FamilyRawIds(int? rawMaterialId)
            {
                var ids = new HashSet<int>();
                if (!rawMaterialId.HasValue) return ids;
                ids.Add(rawMaterialId.Value);
                foreach (var child in remnantChildren.Where(c => c.ParentId == rawMaterialId.Value))
                    ids.Add(child.Id);
                return ids;
            }

            decimal MatchBalance(int? productId, int? rawMaterialId, Func<InventoryBalance, decimal> pick)
            {
                var family = FamilyRawIds(rawMaterialId);
                return balances
                    .Where(b => productId.HasValue
                        ? b.ProductId == productId
                        : b.RawMaterialId.HasValue && family.Contains(b.RawMaterialId.Value))
                    .Sum(pick);
            }

            decimal MatchReserved(int? productId, int? rawMaterialId)
            {
                var family = FamilyRawIds(rawMaterialId);
                return reservations
                    .Where(r => productId.HasValue
                        ? r.ProductId == productId
                        : r.RawMaterialId.HasValue && family.Contains(r.RawMaterialId.Value))
                    .Sum(r => r.Quantity);
            }

            decimal MatchIssued(int? productId, int? rawMaterialId)
            {
                var family = FamilyRawIds(rawMaterialId);
                return issues
                    .Where(t => productId.HasValue
                        ? t.ProductId == productId
                        : t.RawMaterialId.HasValue && family.Contains(t.RawMaterialId.Value))
                    .Sum(t => Math.Abs(t.Quantity));
            }

            var lines = rows.Select(m =>
            {
                var onHand = MatchBalance(m.ProductId, m.RawMaterialId, b => b.QuantityOnHand);
                var available = MatchBalance(m.ProductId, m.RawMaterialId, b => b.QuantityOnHand - b.QuantityReserved);
                var reserved = MatchReserved(m.ProductId, m.RawMaterialId);
                var issued = MatchIssued(m.ProductId, m.RawMaterialId);
                var shortQty = MaterialShortageQty(m.QuantityNeeded, reserved, issued, available);
                return new
                {
                    id = m.Id,
                    sequenceNumber = m.SequenceNumber,
                    productId = m.ProductId,
                    rawMaterialId = m.RawMaterialId,
                    partNo = m.Product != null ? m.Product.partno : m.RawMaterial != null ? m.RawMaterial.PartNo : null,
                    partName = m.Product != null ? m.Product.partname : m.RawMaterial != null ? m.RawMaterial.PartName : null,
                    quantityNeeded = m.QuantityNeeded,
                    notes = m.Notes ?? "",
                    locationId,
                    locationName,
                    quantityOnHand = onHand,
                    quantityAvailable = available,
                    quantityReserved = reserved,
                    quantityIssued = issued,
                    quantityShort = shortQty,
                    isShort = shortQty > 0
                };
            }).ToList();

            var isShortMaterial = !JobStatusIgnoresMaterialShortage(job.Status)
                && lines.Any(l => l.isShort);
            return (lines, isShortMaterial);
        }

        private static bool JobStatusIgnoresMaterialShortage(string? status)
        {
            if (string.IsNullOrWhiteSpace(status))
                return false;
            return status.Equals("Completed", StringComparison.OrdinalIgnoreCase)
                || status.Equals("Cancelled", StringComparison.OrdinalIgnoreCase)
                || status.Equals("Canceled", StringComparison.OrdinalIgnoreCase)
                || status.Equals("Shipped", StringComparison.OrdinalIgnoreCase);
        }

        private static HashSet<int> JobMaterialRefIds(int jobOrderId, int jobOrderNumber)
        {
            _ = jobOrderNumber;
            // Always key inventory to JobOrderID. Including JobOrderNumber reused IDs after delete
            // and attached previous finished-goods / reservations to a new job.
            return new HashSet<int> { jobOrderId };
        }

        private int AllocateNextJobOrderNumber(int tenantId)
        {
            var maxLive = _context.JobOrderMaster.AsNoTracking()
                .Where(j => j.Tenantid == tenantId)
                .Select(j => (int?)j.JobOrderNumber)
                .Max() ?? 0;
            var maxId = _context.JobOrderMaster.AsNoTracking()
                .Where(j => j.Tenantid == tenantId)
                .Select(j => (int?)j.JobOrderID)
                .Max() ?? 0;
            var maxInv = _context.InventoryTransaction.AsNoTracking()
                .Where(t => t.Tenantid == tenantId && t.ReferenceType == "JobOrder" && t.ReferenceId.HasValue)
                .Select(t => t.ReferenceId)
                .Max() ?? 0;
            var maxRes = _context.InventoryReservation.AsNoTracking()
                .Where(r => r.Tenantid == tenantId && r.ReferenceType == "JobOrder")
                .Select(r => (int?)r.ReferenceId)
                .Max() ?? 0;
            return Math.Max(1000, Math.Max(Math.Max(maxLive, maxId), Math.Max(maxInv, maxRes)) + 1);
        }

        private async Task<decimal> NetFinishedGoodsQtyAsync(int tenantId, int jobOrderId)
        {
            var received = await FinishedGoodsReceiptsQuery(tenantId, jobOrderId)
                .SumAsync(t => (decimal?)t.Quantity) ?? 0;
            var issued = await _context.InventoryTransaction
                .Where(t => t.Tenantid == tenantId
                    && t.ReferenceType == "JobOrder"
                    && t.ReferenceId == jobOrderId
                    && t.TransactionTypeId == 2
                    && t.ProductId != null
                    && t.RawMaterialId == null)
                .SumAsync(t => (decimal?)(t.Quantity < 0 ? -t.Quantity : t.Quantity)) ?? 0;
            var net = received - issued;
            return net > 0 ? net : 0;
        }

        private static decimal MaterialShortageQty(
            decimal needed,
            decimal reserved,
            decimal issued,
            decimal available)
        {
            return Math.Max(0, needed - reserved - issued - available);
        }

        private async Task<Dictionary<int, bool>> ComputeShortMaterialFlagsAsync(
            int tenantId,
            IReadOnlyList<(int JobOrderId, int JobOrderNumber, string Status, int LocationId)> jobs)
        {
            var flags = jobs.ToDictionary(j => j.JobOrderId, _ => false);
            var active = jobs.Where(j => !JobStatusIgnoresMaterialShortage(j.Status)).ToList();
            if (active.Count == 0)
                return flags;

            var jobIds = active.Select(j => j.JobOrderId).ToList();
            var reqs = await _context.JobMaterialRequirement
                .AsNoTracking()
                .Where(m => m.Tenantid == tenantId && jobIds.Contains(m.JobOrderId))
                .ToListAsync();
            if (reqs.Count == 0)
                return flags;

            var productIds = reqs.Where(r => r.ProductId.HasValue).Select(r => r.ProductId!.Value).Distinct().ToList();
            var rawIds = reqs.Where(r => r.RawMaterialId.HasValue).Select(r => r.RawMaterialId!.Value).Distinct().ToList();

            var allRefIds = new HashSet<int>();
            var refByJob = new Dictionary<int, HashSet<int>>();
            foreach (var job in active)
            {
                var ids = JobMaterialRefIds(job.JobOrderId, job.JobOrderNumber);
                refByJob[job.JobOrderId] = ids;
                foreach (var id in ids)
                    allRefIds.Add(id);
            }

            var remnantChildren = rawIds.Count == 0
                ? new Dictionary<int, List<int>>()
                : (await _context.RawMaterialMaster
                    .AsNoTracking()
                    .Where(r => r.Tenantid == tenantId
                        && r.IsRemnant
                        && r.ParentRawMaterialId.HasValue
                        && rawIds.Contains(r.ParentRawMaterialId.Value))
                    .Select(r => new { r.Id, ParentId = r.ParentRawMaterialId!.Value })
                    .ToListAsync())
                    .GroupBy(r => r.ParentId)
                    .ToDictionary(g => g.Key, g => g.Select(x => x.Id).ToList());
            var familyRawIds = rawIds.Concat(remnantChildren.SelectMany(kv => kv.Value)).Distinct().ToList();

            var balances = await _context.InventoryBalance
                .AsNoTracking()
                .Where(b => b.Tenantid == tenantId
                    && (
                        (b.ProductId.HasValue && productIds.Contains(b.ProductId.Value))
                        || (b.RawMaterialId.HasValue && familyRawIds.Contains(b.RawMaterialId.Value))
                    ))
                .ToListAsync();

            var reservations = await _context.InventoryReservation
                .AsNoTracking()
                .Where(r => r.Tenantid == tenantId
                    && r.ReferenceType == "JobOrder"
                    && allRefIds.Contains(r.ReferenceId)
                    && r.Quantity > 0)
                .ToListAsync();

            var issues = await _context.InventoryTransaction
                .AsNoTracking()
                .Where(t => t.Tenantid == tenantId
                    && t.ReferenceType == "JobOrder"
                    && t.ReferenceId.HasValue
                    && allRefIds.Contains(t.ReferenceId.Value)
                    && t.TransactionTypeId == 2)
                .ToListAsync();

            var reqsByJob = reqs
                .GroupBy(r => r.JobOrderId)
                .ToDictionary(g => g.Key, g => g.ToList());

            foreach (var job in active)
            {
                if (!reqsByJob.TryGetValue(job.JobOrderId, out var lines))
                    continue;
                var refs = refByJob[job.JobOrderId];
                var loc = job.LocationId;
                foreach (var line in lines)
                {
                    if (line.QuantityNeeded <= 0)
                        continue;
                    HashSet<int> Family(int? rawId)
                    {
                        var ids = new HashSet<int>();
                        if (!rawId.HasValue) return ids;
                        ids.Add(rawId.Value);
                        if (remnantChildren.TryGetValue(rawId.Value, out var kids))
                            foreach (var id in kids) ids.Add(id);
                        return ids;
                    }
                    var family = Family(line.RawMaterialId);
                    var available = balances
                        .Where(b => (loc <= 0 || b.LocationId == loc)
                            && (line.ProductId.HasValue
                                ? b.ProductId == line.ProductId
                                : b.RawMaterialId.HasValue && family.Contains(b.RawMaterialId.Value)))
                        .Sum(b => b.QuantityOnHand - b.QuantityReserved);
                    var reserved = reservations
                        .Where(r => refs.Contains(r.ReferenceId)
                            && (line.ProductId.HasValue
                                ? r.ProductId == line.ProductId
                                : r.RawMaterialId.HasValue && family.Contains(r.RawMaterialId.Value)))
                        .Sum(r => r.Quantity);
                    var issued = issues
                        .Where(t => t.ReferenceId.HasValue
                            && refs.Contains(t.ReferenceId.Value)
                            && (line.ProductId.HasValue
                                ? t.ProductId == line.ProductId
                                : t.RawMaterialId.HasValue && family.Contains(t.RawMaterialId.Value)))
                        .Sum(t => Math.Abs(t.Quantity));
                    if (MaterialShortageQty(line.QuantityNeeded, reserved, issued, available) > 0)
                    {
                        flags[job.JobOrderId] = true;
                        break;
                    }
                }
            }

            return flags;
        }

        private IQueryable<InventoryTransaction> FinishedGoodsReceiptsQuery(int tenantId, int jobOrderId)
        {
            return _context.InventoryTransaction.Where(t =>
                t.Tenantid == tenantId
                && t.ReferenceType == "JobOrder"
                && t.ReferenceId == jobOrderId
                && t.TransactionTypeId == 1
                && t.ProductId != null
                && t.RawMaterialId == null);
        }

        private async Task<string?> ApplyFinishedGoodsInventoryAsync(
            JobOrderMaster job,
            string previousStatus,
            JobOrderReq request)
        {
            var nowCompleted = IsCompletedStatus(job.Status);
            var wasCompleted = IsCompletedStatus(previousStatus);
            var stepsReopenedUnderShip =
                !wasCompleted
                && !nowCompleted
                && (string.Equals(previousStatus, "Partially Shipped", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(previousStatus, "Shipped", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(job.Status, "Partially Shipped", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(job.Status, "Shipped", StringComparison.OrdinalIgnoreCase))
                && request.RoutingSteps != null
                && request.RoutingSteps.Count > 0
                && request.RoutingSteps.Any(s =>
                    !string.Equals(s.status, "Completed", StringComparison.OrdinalIgnoreCase));

            if (nowCompleted == wasCompleted && !stepsReopenedUnderShip)
                return null;

            var tenantId = job.Tenantid;
            var userId = request.UserId > 0 ? request.UserId : (int?)null;
            var label = JobInventoryLabel(job);

            if (nowCompleted && !wasCompleted)
            {
                var qty = ResolveFinishedQty(job, request);
                if (qty <= 0)
                    return null;

                // Use net JO FG (receipts − reopen/issue reversals), not cumulative receipts,
                // so re-complete after reopen restores stock instead of no-op / under-posting.
                var already = await NetFinishedGoodsQtyAsync(tenantId, job.JobOrderID);
                if (already >= qty)
                    return null;

                var locationId = await ResolveJobInventoryLocationAsync(job);
                if (!locationId.HasValue)
                    return "Location is required to put finished goods into inventory. Set the customer order location.";

                var productId = await ProductSourcing.EnsureFinishedProductAsync(
                    _context,
                    tenantId,
                    job.PartNo,
                    job.PartName,
                    job.Unit,
                    job.UnitPrice,
                    ProductSourcing.Make);
                if (!productId.HasValue)
                    return null;

                if (job.CustomerOrderDetailID > 0)
                {
                    var detail = await _context.CustomerOrderDetails
                        .FirstOrDefaultAsync(d => d.ID == job.CustomerOrderDetailID && d.Tenantid == tenantId);
                    if (detail != null && !detail.productid.HasValue)
                        detail.productid = productId;
                }

                var toReceive = qty - already;
                var (ok, err) = await _inventoryService.ReceiveStockInTransactionAsync(
                    tenantId,
                    productId,
                    rawMaterialId: null,
                    locationId.Value,
                    toReceive,
                    "JobOrder",
                    job.JobOrderID,
                    lotId: null,
                    userId,
                    $"Finished on {label}");
                if (!ok)
                    return $"Job saved but finished-goods inventory failed: {err}";

                await _context.SaveChangesAsync();
                return null;
            }

            if (!wasCompleted && !stepsReopenedUnderShip)
                return null;

            // Reopen: reverse JO FG still on the shelf.
            // Shipments issue against CustomerShipment (JO net stays high); ShippedQty estimates
            // how much already left. If ShippedQty overstates, fall back to on-hand.
            var netQty = await NetFinishedGoodsQtyAsync(tenantId, job.JobOrderID);
            if (netQty <= 0)
                return null;

            var receipt = await FinishedGoodsReceiptsQuery(tenantId, job.JobOrderID)
                .OrderByDescending(t => t.TransactionDate)
                .FirstOrDefaultAsync();
            var reverseLocationId = receipt?.LocationId ?? await ResolveJobInventoryLocationAsync(job);
            if (!reverseLocationId.HasValue)
                return $"Job saved but reversing finished goods failed: no inventory location for {label}.";

            var reverseProductId = receipt?.ProductId;
            if (!reverseProductId.HasValue)
                return $"Job saved but reversing finished goods failed: no finished product on {label}.";

            decimal shippedQty = 0;
            if (job.CustomerOrderDetailID > 0)
            {
                shippedQty = await _context.CustomerOrderDetails
                    .AsNoTracking()
                    .Where(d => d.ID == job.CustomerOrderDetailID && d.Tenantid == tenantId)
                    .Select(d => (decimal)d.ShippedQty)
                    .FirstOrDefaultAsync();
            }

            var onHand = await _inventoryService.GetOnHandAsync(
                tenantId, reverseProductId.Value, reverseLocationId.Value);
            var toReverse = Math.Max(0m, netQty - shippedQty);
            if (toReverse <= 0 && onHand > 0)
                toReverse = Math.Min(netQty, onHand);
            else if (toReverse > 0 && onHand >= 0)
                toReverse = Math.Min(toReverse, onHand > 0 ? onHand : toReverse);

            if (toReverse <= 0)
                return null;

            var (issueOk, issueErr) = await _inventoryService.IssueStockInTransactionAsync(
                tenantId,
                reverseProductId,
                rawMaterialId: null,
                reverseLocationId.Value,
                toReverse,
                "JobOrder",
                job.JobOrderID,
                userId,
                $"Reversed finished goods; {label} reopened",
                allowShortage: true);
            if (!issueOk)
                return $"Job saved but reversing finished goods failed: {issueErr}";

            await _context.SaveChangesAsync();
            return null;
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
        public List<int> DeletedAttachmentIds { get; set; } = new List<int>();
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
        /// <summary>
        /// Null = leave existing planned material unchanged (PWA step saves). Empty list clears it.
        /// </summary>
        public List<JobMaterialRequirementReq>? MaterialRequirements { get; set; }
    }

    public class JobOrderAttachmentUploadContext
    {
        public int JobOrderId { get; set; }
        public int OrderId { get; set; }
        public int TenantId { get; set; }
    }

    public class JobMaterialRequirementReq
    {
        public int Id { get; set; }
        public int SequenceNumber { get; set; }
        public int? ProductId { get; set; }
        public int? RawMaterialId { get; set; }
        public decimal QuantityNeeded { get; set; }
        public string? Notes { get; set; }
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
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public int Size { get; set; }
        public string FileUrl { get; set; } = "";
        public int FileUniqueno { get; set; }
        public string UploadFile { get; set; } = "";
        public string PageNo { get; set; } = "0";
        public int CreatedBy { get; set; }
    }

    public class JobOrderCommentDto
    {
        public int id { get; set; }
        public string text { get; set; }
        public string createdAt { get; set; }
        public string createdBy { get; set; }
        /// <summary>Client-only; stripped before CommentsJson persist.</summary>
        public List<int>? mentionedUserIds { get; set; }
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

