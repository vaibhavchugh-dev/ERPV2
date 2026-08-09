using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Utilities;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class QuotationController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly IConfiguration _configuration;

        public QuotationController(CimmpleDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        [HttpGet("GetQuotations")]
        public IActionResult GetQuotations([FromQuery] int tenantid, [FromQuery] int? locationId = null)
        {
            try
            {
                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                var quotationsQuery = _context.QuotationOrder.Where(q => q.Tenantid == tenantid);
                if (filterLocationId.HasValue)
                {
                    quotationsQuery = quotationsQuery.Where(q => q.Locationid == filterLocationId.Value);
                }

                var quotations = quotationsQuery
                    .OrderByDescending(q => q.OrderDate)
                    .Select(q => new
                    {
                        orderID = q.OrderID,
                        quotationNumber = q.PONumber,
                        customerID = q.CustomerID,
                        customerCode = q.customercode ?? "",
                        customerName = q.CustomerName ?? "",
                        orderDate = q.OrderDate,
                        totalAmount = q.TotalAmount,
                        status = q.Status ?? "Draft",
                        customerRefNo = q.CustomerRefNo ?? "",
                        isConverted = q.isConverted ?? 0,
                        convertedOrderId = q.convertedOrderId,
                        locationId = q.Locationid
                    })
                    .ToList();

                // convertedOrderId stores CustomerOrder.OrderID; resolve PONumber for display (CO#)
                var convertedOrderIds = quotations
                    .Where(q => q.convertedOrderId.HasValue && q.convertedOrderId.Value > 0)
                    .Select(q => q.convertedOrderId!.Value)
                    .Distinct()
                    .ToList();
                var convertedOrderNumbers = convertedOrderIds.Count == 0
                    ? new Dictionary<int, int>()
                    : _context.CustomerOrder
                        .AsNoTracking()
                        .Where(o => o.Tenantid == tenantid && convertedOrderIds.Contains(o.OrderID))
                        .Select(o => new { o.OrderID, o.PONumber })
                        .ToList()
                        .ToDictionary(o => o.OrderID, o => o.PONumber);

                var quotationsWithOrderNumber = quotations.Select(q => new
                {
                    q.orderID,
                    q.quotationNumber,
                    q.customerID,
                    q.customerCode,
                    q.customerName,
                    q.orderDate,
                    q.totalAmount,
                    q.status,
                    q.customerRefNo,
                    q.isConverted,
                    q.convertedOrderId,
                    convertedOrderNumber = q.convertedOrderId.HasValue &&
                        convertedOrderNumbers.TryGetValue(q.convertedOrderId.Value, out var po)
                        ? (int?)po
                        : null,
                    q.locationId
                }).ToList();

                return Ok(new { result = quotationsWithOrderNumber });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetQuotationById")]
        public IActionResult GetQuotationById([FromQuery] int quotationId, [FromQuery] int tenantId)
        {
            try
            {
                var quotation = _context.QuotationOrder
                    .Where(q => q.OrderID == quotationId && q.Tenantid == tenantId)
                    .FirstOrDefault();

                if (quotation == null)
                {
                    return NotFound(new { error = "Quotation not found" });
                }

                // Query details - handle QuantityTiers column gracefully if it doesn't exist
                var detailsList = _context.QuotationOrderDetails
                    .Where(d => d.OrderID == quotationId && d.Tenantid == tenantId)
                    .OrderBy(d => d.ItemNo)
                    .ToList();

                var details = new List<object>();
                foreach (var d in detailsList)
                {
                    object priceBreakdownMatrix = null;
                    // Safely access QuantityTiers property - handle case where column might not exist
                    string quantityTiersValue = null;
                    try
                    {
                        quantityTiersValue = d.QuantityTiers;
                    }
                    catch
                    {
                        // Column doesn't exist in database, set to null
                        quantityTiersValue = null;
                    }
                    
                    if (quantityTiersValue != null && !string.IsNullOrWhiteSpace(quantityTiersValue))
                    {
                        try
                        {
                            // Use JsonDocument to parse and then serialize back to ensure valid JSON structure
                            using (JsonDocument doc = JsonDocument.Parse(quantityTiersValue))
                            {
                                if (doc != null && doc.RootElement.ValueKind == JsonValueKind.Object)
                                {
                                    // Convert JsonDocument to a serializable object using JsonSerializer
                                    priceBreakdownMatrix = JsonSerializer.Deserialize<object>(JsonSerializer.Serialize(doc.RootElement));
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            // If deserialization fails, set to null (backward compatibility)
                            priceBreakdownMatrix = null;
                            Console.WriteLine($"Error deserializing QuantityTiers for detail ID: {ex.Message}");
                        }
                    }

                    details.Add(new
                    {
                        id = d.ID,
                        itemNo = d.ItemNo,
                        partName = d.partname ?? "",
                        partNo = d.PartNo ?? "",
                        dueDate = d.DueDate,
                        jobNumber = d.JobNumber ?? "",
                        jobDesc = d.JobDesc ?? "",
                        qtyOrdered = d.QtyOrdered,
                        unit = d.Unit ?? "",
                        unitPrice = d.UnitPrice,
                        jobPriority = d.JobPriority,
                        discount = d.Discount,
                        discountType = string.IsNullOrWhiteSpace(d.DiscountType) ? "Percent" : d.DiscountType,
                        productId = d.productid,
                        leadTime = d.leadTime ?? "",
                        notes = d.notes ?? "",
                        priceBreakdownMatrix = priceBreakdownMatrix
                    });
                }

                var attachments = GetQuotationAttachmentDtos(quotation.OrderID, quotation.Tenantid, quotation.AttachmentsJson);

                // Load comments from JSON
                List<QuotationCommentDto> comments = null;
                try
                {
                    if (!string.IsNullOrEmpty(quotation.CommentsJson))
                    {
                        var options = new JsonSerializerOptions
                        {
                            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                            PropertyNameCaseInsensitive = true
                        };
                        comments = JsonSerializer.Deserialize<List<QuotationCommentDto>>(quotation.CommentsJson, options);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error deserializing comments: {ex.Message}");
                    comments = null;
                }

                var result = new
                {
                    orderID = quotation.OrderID,
                    customerID = quotation.CustomerID,
                    customerCode = quotation.customercode ?? "",
                    poNumber = quotation.PONumber,
                    customerName = quotation.CustomerName ?? "",
                    address = quotation.address ?? "",
                    customerPoNumber = quotation.CustomerPoNumber ?? "",
                    orderDate = quotation.OrderDate,
                    totalAmount = quotation.TotalAmount,
                    userId = quotation.UserId,
                    userToken = quotation.UserToken,
                    status = quotation.Status ?? "",
                    tenantid = quotation.Tenantid,
                    shippingInstructions = quotation.shippingInstructions ?? "",
                    externalCustomerPO = quotation.ExternalCustomerPO ?? "",
                    externalOrderDate = quotation.ExternalOrderDate,
                    buyerName = quotation.BuyerName ?? "",
                    customerRefNo = quotation.CustomerRefNo ?? "",
                    isConverted = quotation.isConverted ?? 0,
                    convertedOrderId = quotation.convertedOrderId,
                    convertedOrderNumber = quotation.convertedOrderId.HasValue && quotation.convertedOrderId.Value > 0
                        ? _context.CustomerOrder
                            .AsNoTracking()
                            .Where(o => o.OrderID == quotation.convertedOrderId.Value && o.Tenantid == tenantId)
                            .Select(o => (int?)o.PONumber)
                            .FirstOrDefault()
                        : null,
                    locationId = quotation.Locationid,
                    details = details,
                    attachments = attachments.Select(a => new
                    {
                        id = a.Id,
                        name = a.Name,
                        size = a.Size,
                        fileUrl = a.FileUrl,
                        fileUniqueno = a.FileUniqueno,
                        uploadFile = a.UploadFile,
                        pageNo = a.PageNo,
                        createdBy = a.CreatedBy
                    }).ToList(),
                    comments = comments != null ? comments.Select(c => new
                    {
                        id = c.Id,
                        text = c.Text,
                        createdAt = c.CreatedAt,
                        createdBy = c.CreatedBy
                    }).ToList() : null
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SaveQuotation")]
        [Consumes("multipart/form-data", "application/json")]
        public async Task<IActionResult> SaveQuotation()
        {
            try
            {
                QuotationReq? request = null;
                List<IFormFile> newFiles = new List<IFormFile>();

                if (Request.HasFormContentType)
                {
                    var form = await Request.ReadFormAsync();
                    var formField = form["formField"].FirstOrDefault()
                                 ?? form["FormField"].FirstOrDefault();

                    if (string.IsNullOrWhiteSpace(formField))
                    {
                        return BadRequest(new { error = "formField is required for multipart SaveQuotation" });
                    }

                    var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    request = JsonSerializer.Deserialize<QuotationReq>(formField, options);
                    newFiles = form.Files?.Where(f => f != null && f.Length > 0).ToList()
                               ?? new List<IFormFile>();
                }
                else
                {
                    using var reader = new StreamReader(Request.Body);
                    var body = await reader.ReadToEndAsync();
                    if (string.IsNullOrWhiteSpace(body))
                    {
                        return BadRequest(new { error = "Request body is required" });
                    }

                    var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    request = JsonSerializer.Deserialize<QuotationReq>(body, options);
                }

                if (request == null)
                {
                    return BadRequest(new { error = "Request is null", details = "Model binding / deserialization failed." });
                }

                Console.WriteLine($"Received SaveQuotation request - OrderID: {request.OrderID}, CustomerID: {request.CustomerID}, Tenantid: {request.Tenantid}, NewFiles: {newFiles.Count}, DeletedAttachments: {request.DeletedAttachmentIds?.Count ?? 0}");

                if (request.CustomerID <= 0)
                {
                    return BadRequest(new { error = "Customer is required" });
                }

                if (request.Details == null)
                {
                    return BadRequest(new { error = "Details cannot be null" });
                }

                if (request.Tenantid <= 0)
                {
                    request.Tenantid = GetTenantId();
                }

                int createdBy = request.UserId > 0 ? request.UserId : (GetUserId() ?? 0);
                QuotationOrder quotation;

                if (request.OrderID > 0)
                {
                    quotation = _context.QuotationOrder
                        .FirstOrDefault(q => q.OrderID == request.OrderID && q.Tenantid == request.Tenantid);

                    if (quotation == null)
                    {
                        return NotFound(new { error = "Quotation not found" });
                    }
                }
                else
                {
                    var existingQuotations = _context.QuotationOrder
                        .Where(q => q.Tenantid == request.Tenantid)
                        .ToList();

                    int nextPONumber;
                    if (existingQuotations.Any())
                    {
                        var maxPONumber = existingQuotations.Max(q => q.PONumber);
                        nextPONumber = Math.Max(1000, maxPONumber + 1);
                    }
                    else
                    {
                        nextPONumber = 1000;
                    }

                    quotation = new QuotationOrder
                    {
                        Tenantid = request.Tenantid,
                        OrderDate = request.OrderDate.Date,
                        UserId = request.UserId,
                        UserToken = request.UserToken,
                        PONumber = nextPONumber
                    };
                    _context.QuotationOrder.Add(quotation);
                }

                quotation.OrderDate = request.OrderDate.Date;
                quotation.CustomerID = request.CustomerID;
                quotation.customercode = request.CustomerCode ?? "";
                quotation.CustomerName = request.CustomerName ?? "";
                quotation.address = request.Address ?? "";
                quotation.CustomerPoNumber = request.CustomerPoNumber ?? "";
                quotation.TotalAmount = request.TotalAmount;
                quotation.Status = request.Status ?? "Draft";
                quotation.shippingInstructions = request.ShippingInstructions ?? "";
                quotation.ExternalCustomerPO = request.ExternalCustomerPO ?? "";
                quotation.ExternalOrderDate = request.ExternalOrderDate;
                quotation.BuyerName = request.BuyerName ?? "";
                quotation.CustomerRefNo = request.CustomerRefNo ?? "";
                if (!TryResolveLocationId(request.LocationId, out var resolvedLocationId, out var forbidLoc))
                    return forbidLoc!;
                quotation.Locationid = resolvedLocationId > 0 ? resolvedLocationId : request.LocationId;

                if (request.Comments != null && request.Comments.Count > 0)
                {
                    var commentOptions = new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                        WriteIndented = false
                    };
                    quotation.CommentsJson = JsonSerializer.Serialize(request.Comments, commentOptions);
                }
                else
                {
                    quotation.CommentsJson = null;
                }

                // Persist quotation first so new attachments can use OrderID.
                _context.SaveChanges();

                // Handle quotation details
                if (request.Details != null && request.Details.Count > 0)
                {
                    var existingDetails = _context.QuotationOrderDetails
                        .Where(d => d.OrderID == quotation.OrderID && d.Tenantid == request.Tenantid)
                        .ToList();
                    _context.QuotationOrderDetails.RemoveRange(existingDetails);

                    foreach (var detail in request.Details)
                    {
                        var quotationDetail = new QuotationOrderDetails
                        {
                            OrderID = quotation.OrderID,
                            ItemNo = detail.ItemNo,
                            partname = detail.PartName ?? "",
                            PartNo = detail.PartNo ?? "",
                            DueDate = detail.DueDate.Date,
                            JobNumber = detail.JobNumber ?? "",
                            JobDesc = detail.JobDesc ?? "",
                            QtyOrdered = detail.QtyOrdered,
                            Unit = detail.Unit ?? "",
                            UnitPrice = detail.UnitPrice,
                            JobPriority = detail.JobPriority,
                            Discount = detail.Discount,
                            DiscountType = string.IsNullOrWhiteSpace(detail.DiscountType) ? "Percent" : detail.DiscountType,
                            Tenantid = request.Tenantid,
                            productid = detail.ProductId,
                            leadTime = detail.LeadTime ?? "",
                            notes = detail.Notes ?? "",
                            QuantityTiers = detail.PriceBreakdownMatrix != null
                                ? JsonSerializer.Serialize(detail.PriceBreakdownMatrix)
                                : null
                        };
                        _context.QuotationOrderDetails.Add(quotationDetail);
                    }

                    _context.SaveChanges();
                }

                // Process deleted existing attachments (Azure + DB) without touching retained ones.
                if (request.DeletedAttachmentIds != null && request.DeletedAttachmentIds.Count > 0)
                {
                    await ProcessDeletedQuotationAttachments(
                        quotation.OrderID,
                        request.Tenantid,
                        request.DeletedAttachmentIds);
                }

                // Upload only newly added files. Existing attachments are never re-uploaded.
                if (newFiles.Count > 0)
                {
                    var uploadError = await UploadNewQuotationAttachments(
                        quotation,
                        newFiles,
                        createdBy);

                    if (!string.IsNullOrEmpty(uploadError))
                    {
                        return StatusCode(500, new { error = uploadError });
                    }
                }

                SyncQuotationAttachmentsJson(quotation);
                _context.SaveChanges();

                var attachments = GetQuotationAttachmentDtos(
                    quotation.OrderID,
                    quotation.Tenantid,
                    quotation.AttachmentsJson);

                return Ok(new
                {
                    result = new
                    {
                        id = quotation.OrderID,
                        poNumber = quotation.PONumber,
                        message = "Quotation saved successfully",
                        attachments = attachments.Select(a => new
                        {
                            id = a.Id,
                            name = a.Name,
                            size = a.Size,
                            fileUrl = a.FileUrl,
                            fileUniqueno = a.FileUniqueno,
                            uploadFile = a.UploadFile,
                            pageNo = a.PageNo,
                            createdBy = a.CreatedBy
                        }).ToList()
                    }
                });
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

        [HttpGet("CheckQuotationDeletionImpact")]
        public IActionResult CheckQuotationDeletionImpact([FromQuery] int quotationId, [FromQuery] int tenantId)
        {
            try
            {
                var quotation = _context.QuotationOrder
                    .FirstOrDefault(q => q.OrderID == quotationId && q.Tenantid == tenantId);

                if (quotation == null)
                {
                    return NotFound(new { error = "Quotation not found" });
                }

                var impact = new DeletionImpactResult
                {
                    CanDelete = true,
                    BlockingReasons = new List<string>(),
                    BlockingDependencies = new List<BlockingDependency>(),
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                // Check if quotation is referenced by CustomerOrder
                var referencedOrders = _context.CustomerOrder
                    .Where(co => co.quotationId == quotationId && co.Tenantid == tenantId)
                    .ToList();
                
                if (referencedOrders.Any())
                {
                    var orderDependency = new BlockingDependency
                    {
                        EntityType = "CustomerOrder",
                        Description = $"Quotation is referenced by {referencedOrders.Count} customer order(s)",
                        Items = referencedOrders.Select(o => new DependencyItem
                        {
                            Id = o.OrderID,
                            Name = $"CO#{o.PONumber}",
                            DeleteEndpoint = $"/Order/DeleteOrder?orderId={o.OrderID}&tenantId={tenantId}"
                        }).ToList()
                    };
                    
                    impact.BlockingDependencies.Add(orderDependency);
                    var orderNumbers = referencedOrders.Select(o => $"CO#{o.PONumber}").ToList();
                    impact.BlockingReasons.Add(
                        $"Quotation is referenced by {referencedOrders.Count} customer order(s): {string.Join(", ", orderNumbers)}. Remove the reference first or delete the orders."
                    );
                    impact.CanDelete = false;
                }

                // Check if quotation has been converted to an order
                if (quotation.isConverted == 1 && quotation.convertedOrderId.HasValue)
                {
                    var convertedOrder = _context.CustomerOrder
                        .FirstOrDefault(co => co.OrderID == quotation.convertedOrderId.Value && co.Tenantid == tenantId);
                    
                    if (convertedOrder != null)
                    {
                        var convertedDependency = new BlockingDependency
                        {
                            EntityType = "CustomerOrder",
                            Description = "Quotation has been converted to a customer order",
                            Items = new List<DependencyItem>
                            {
                                new DependencyItem
                                {
                                    Id = convertedOrder.OrderID,
                                    Name = $"CO#{convertedOrder.PONumber}",
                                    DeleteEndpoint = $"/Order/DeleteOrder?orderId={convertedOrder.OrderID}&tenantId={tenantId}"
                                }
                            }
                        };
                        
                        impact.BlockingDependencies.Add(convertedDependency);
                        impact.BlockingReasons.Add(
                            $"Quotation has been converted to Customer Order CO#{convertedOrder.PONumber}. Delete the order first."
                        );
                        impact.CanDelete = false;
                    }
                }

                // If can delete, list what will be deleted
                if (impact.CanDelete)
                {
                    var detailCount = _context.QuotationOrderDetails
                        .Count(d => d.OrderID == quotationId && d.Tenantid == tenantId);
                    if (detailCount > 0)
                    {
                        impact.WillBeDeleted.Add(new ImpactedEntity
                        {
                            EntityType = "Quotation Details",
                            Count = detailCount,
                            Description = $"{detailCount} line item(s) will be deleted"
                        });
                    }

                    var attachmentCount = _context.QuotationOrderAttachment
                        .Count(a => a.orderid == quotationId);
                    if (attachmentCount > 0)
                    {
                        impact.WillBeDeleted.Add(new ImpactedEntity
                        {
                            EntityType = "Attachments",
                            Count = attachmentCount,
                            Description = $"{attachmentCount} attachment(s) will be deleted"
                        });
                    }

                    impact.Warnings.Add("This action cannot be undone");
                }

                return Ok(new { result = impact });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpPost("DuplicateQuotation")]
        public async Task<IActionResult> DuplicateQuotation([FromQuery] int quotationId, [FromQuery] int tenantId)
        {
            try
            {
                var source = _context.QuotationOrder
                    .FirstOrDefault(q => q.OrderID == quotationId && q.Tenantid == tenantId);
                if (source == null)
                {
                    return NotFound(new { error = "Quotation not found" });
                }

                var sourceDetails = _context.QuotationOrderDetails
                    .Where(d => d.OrderID == quotationId && d.Tenantid == tenantId)
                    .OrderBy(d => d.ItemNo)
                    .ToList();

                var existingQuotations = _context.QuotationOrder
                    .Where(q => q.Tenantid == tenantId)
                    .ToList();
                int nextPONumber = existingQuotations.Any()
                    ? Math.Max(1000, existingQuotations.Max(q => q.PONumber) + 1)
                    : 1000;

                var duplicate = new QuotationOrder
                {
                    Tenantid = source.Tenantid,
                    CustomerID = source.CustomerID,
                    customercode = source.customercode ?? "",
                    CustomerName = source.CustomerName ?? "",
                    address = source.address ?? "",
                    CustomerPoNumber = source.CustomerPoNumber ?? "",
                    OrderDate = DateTime.Now.Date,
                    TotalAmount = source.TotalAmount,
                    UserId = source.UserId,
                    UserToken = source.UserToken,
                    Status = "Draft",
                    shippingInstructions = source.shippingInstructions ?? "",
                    ExternalCustomerPO = source.ExternalCustomerPO ?? "",
                    ExternalOrderDate = source.ExternalOrderDate,
                    BuyerName = source.BuyerName ?? "",
                    CustomerRefNo = "",
                    isConverted = 0,
                    convertedOrderId = null,
                    Locationid = source.Locationid,
                    CommentsJson = null,
                    AttachmentsJson = null,
                    PONumber = nextPONumber
                };
                _context.QuotationOrder.Add(duplicate);
                _context.SaveChanges();

                foreach (var detail in sourceDetails)
                {
                    _context.QuotationOrderDetails.Add(new QuotationOrderDetails
                    {
                        OrderID = duplicate.OrderID,
                        ItemNo = detail.ItemNo,
                        partname = detail.partname ?? "",
                        PartNo = detail.PartNo ?? "",
                        DueDate = detail.DueDate,
                        JobNumber = detail.JobNumber ?? "",
                        JobDesc = detail.JobDesc ?? "",
                        QtyOrdered = detail.QtyOrdered,
                        Unit = detail.Unit ?? "",
                        UnitPrice = detail.UnitPrice,
                        JobPriority = detail.JobPriority,
                        Discount = detail.Discount,
                        DiscountType = detail.DiscountType,
                        Tenantid = tenantId,
                        productid = detail.productid,
                        leadTime = detail.leadTime ?? "",
                        notes = detail.notes ?? "",
                        QuantityTiers = detail.QuantityTiers
                    });
                }
                _context.SaveChanges();

                var sourceAttachments = _context.QuotationOrderAttachment
                    .Where(a => a.orderid == quotationId && a.TenantID == tenantId)
                    .OrderBy(a => a.Id)
                    .ToList();

                int createdBy = GetUserId() ?? source.UserId;
                foreach (var srcAtt in sourceAttachments)
                {
                    if (string.IsNullOrEmpty(srcAtt.UploadFile))
                    {
                        continue;
                    }

                    int nextFileUniqueNo = _context.QuotationOrderAttachment.Any()
                        ? _context.QuotationOrderAttachment.Max(x => x.FileUniqueno) + 1
                        : 1;
                    var ext = Path.GetExtension(srcAtt.UploadFile) ?? "";
                    var blobName = $"{nextFileUniqueNo}{ext}";

                    var sourceInfo = ModuleFileStorage.CreateFileInfo(
                        tenantId, ModuleFileStorage.QuotationsFolder, srcAtt.UploadFile, createdBy);
                    var destInfo = ModuleFileStorage.CreateFileInfo(
                        tenantId, ModuleFileStorage.QuotationsFolder, blobName, createdBy);

                    var copied = await ModuleFileStorage.CopyBlobAsync(_context, _configuration, sourceInfo, destInfo);
                    if (!copied)
                    {
                        continue;
                    }

                    _context.QuotationOrderAttachment.Add(new QuotationOrderAttachment
                    {
                        orderid = duplicate.OrderID,
                        Name = srcAtt.Name,
                        size = srcAtt.size,
                        FileUniqueno = nextFileUniqueNo,
                        UploadFile = blobName,
                        TenantID = tenantId,
                        FileCode = "",
                        Pageno = srcAtt.Pageno ?? "0",
                        createdby = createdBy
                    });
                    _context.SaveChanges();
                }

                SyncQuotationAttachmentsJson(duplicate);
                _context.SaveChanges();

                return Ok(new { result = new { id = duplicate.OrderID, message = "Quotation duplicated successfully" } });
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

        public class CopyAttachmentsToOrderRequest
        {
            public List<int> AttachmentIds { get; set; } = new List<int>();
        }

        /// <summary>
        /// Copies selected quotation attachment blobs into the Orders folder and writes OrderAttachment + AttachmentsJson.
        /// </summary>
        [HttpPost("CopyAttachmentsToOrder")]
        public async Task<IActionResult> CopyAttachmentsToOrder(
            [FromQuery] int quotationId,
            [FromQuery] int orderId,
            [FromQuery] int tenantId,
            [FromBody] CopyAttachmentsToOrderRequest? request)
        {
            try
            {
                var quotation = _context.QuotationOrder
                    .FirstOrDefault(q => q.OrderID == quotationId && q.Tenantid == tenantId);
                var order = _context.CustomerOrder
                    .FirstOrDefault(o => o.OrderID == orderId && o.Tenantid == tenantId);
                if (quotation == null || order == null)
                {
                    return NotFound(new { error = "Quotation or order not found" });
                }

                var selectedIds = request?.AttachmentIds ?? new List<int>();
                var sourceQuery = _context.QuotationOrderAttachment
                    .Where(a => a.orderid == quotationId && a.TenantID == tenantId);
                if (selectedIds.Count > 0)
                {
                    sourceQuery = sourceQuery.Where(a => selectedIds.Contains(a.Id));
                }
                var sourceAttachments = sourceQuery.OrderBy(a => a.Id).ToList();

                int createdBy = GetUserId() ?? 0;
                var copiedDtos = new List<QuotationAttachmentDto>();

                foreach (var srcAtt in sourceAttachments)
                {
                    if (string.IsNullOrEmpty(srcAtt.UploadFile))
                    {
                        continue;
                    }

                    int nextFileUniqueNo = _context.OrderAttachment.Any()
                        ? _context.OrderAttachment.Max(x => x.FileUniqueno) + 1
                        : 1;
                    var ext = Path.GetExtension(srcAtt.UploadFile) ?? "";
                    var blobName = $"{nextFileUniqueNo}{ext}";

                    var sourceInfo = ModuleFileStorage.CreateFileInfo(
                        tenantId, ModuleFileStorage.QuotationsFolder, srcAtt.UploadFile, createdBy);
                    var destInfo = ModuleFileStorage.CreateFileInfo(
                        tenantId, ModuleFileStorage.OrdersFolder, blobName, createdBy);

                    var copied = await ModuleFileStorage.CopyBlobAsync(_context, _configuration, sourceInfo, destInfo);
                    if (!copied)
                    {
                        continue;
                    }

                    var orderAtt = new OrderAttachment
                    {
                        orderid = orderId,
                        Name = srcAtt.Name,
                        size = srcAtt.size,
                        FileUniqueno = nextFileUniqueNo,
                        UploadFile = blobName,
                        TenantID = tenantId,
                        FileCode = "",
                        Pageno = srcAtt.Pageno ?? "0",
                        createdby = createdBy
                    };
                    _context.OrderAttachment.Add(orderAtt);
                    _context.SaveChanges();

                    copiedDtos.Add(new QuotationAttachmentDto
                    {
                        Id = orderAtt.Id,
                        Name = orderAtt.Name,
                        Size = orderAtt.size,
                        FileUrl = orderAtt.UploadFile,
                        FileUniqueno = orderAtt.FileUniqueno,
                        UploadFile = orderAtt.UploadFile,
                        PageNo = orderAtt.Pageno,
                        CreatedBy = orderAtt.createdby
                    });
                }

                var attachmentOptions = new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                    WriteIndented = false
                };
                order.AttachmentsJson = copiedDtos.Count > 0
                    ? JsonSerializer.Serialize(copiedDtos, attachmentOptions)
                    : null;
                _context.SaveChanges();

                return Ok(new { result = new { message = "Attachments copied", count = copiedDtos.Count, attachments = copiedDtos } });
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

        [HttpDelete("DeleteQuotation")]
        public async Task<IActionResult> DeleteQuotation([FromQuery] int quotationId, [FromQuery] int tenantId)
        {
            try
            {
                var quotation = _context.QuotationOrder
                    .FirstOrDefault(q => q.OrderID == quotationId && q.Tenantid == tenantId);

                if (quotation == null)
                {
                    return NotFound(new { error = "Quotation not found" });
                }

                // Delete associated attachments (Azure blobs + DB rows)
                var attachments = _context.QuotationOrderAttachment
                    .Where(a => a.orderid == quotationId && a.TenantID == tenantId)
                    .ToList();
                if (attachments.Any())
                {
                    var blobInfos = attachments
                        .Where(a => !string.IsNullOrEmpty(a.UploadFile))
                        .Select(a => ModuleFileStorage.CreateFileInfo(
                            tenantId,
                            ModuleFileStorage.QuotationsFolder,
                            a.UploadFile))
                        .ToList();

                    if (blobInfos.Count > 0)
                    {
                        await ModuleFileStorage.DeleteManyAsync(_context, _configuration, blobInfos);
                    }

                    _context.QuotationOrderAttachment.RemoveRange(attachments);
                }

                // Delete associated details
                var details = _context.QuotationOrderDetails
                    .Where(d => d.OrderID == quotationId && d.Tenantid == tenantId)
                    .ToList();
                _context.QuotationOrderDetails.RemoveRange(details);

                // Delete the quotation
                _context.QuotationOrder.Remove(quotation);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Quotation deleted successfully" } });
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

        [HttpGet("GetVendorQuotations")]
        public IActionResult GetVendorQuotations([FromQuery] int tenantid, [FromQuery] int? locationId = null)
        {
            try
            {
                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                // Filter out response-only quotations - these are child quotations that shouldn't appear in listing
                var quotationsQuery = _context.VendorQuotations
                    .Where(q => q.Tenantid == tenantid && (q.IsResponseOnly == null || q.IsResponseOnly == false));

                if (filterLocationId.HasValue)
                {
                    quotationsQuery = quotationsQuery.Where(q => q.locationid == filterLocationId.Value);
                }

                var quotations = quotationsQuery
                    .OrderByDescending(q => q.OrderDate)
                    .Select(q => new
                    {
                        orderID = q.OrderID,
                        quotationNumber = q.PONumber,
                        vendorID = q.VendorID,
                        vendorCode = q.vendorcode ?? "",
                        vendorName = q.VendorName ?? "",
                        orderDate = q.OrderDate,
                        totalAmount = q.TotalAmount,
                        status = q.Status ?? "Draft",
                        vendorRefNo = "",
                        isConverted = q.isconverted ?? 0,
                        convertedOrderId = q.convertedOrderId,
                        locationId = q.locationid,
                        QuotationType = q.VendorOrderType ?? "Material",
                        parentQuotationID = q.ParentQuotationID
                    })
                    .ToList();

                return Ok(new { result = quotations });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpGet("GetVendorQuotationsByVendorCode")]
        public IActionResult GetVendorQuotationsByVendorCode([FromQuery] string vendorCode)
        {
            try
            {
                if (string.IsNullOrEmpty(vendorCode))
                {
                    return BadRequest(new { error = "Vendor code is required" });
                }

                var quotations = _context.VendorQuotations
                    .Where(q => q.vendorcode != null && 
                               q.vendorcode.ToLower() == vendorCode.ToLower() &&
                               q.isSent == true)  // Only show quotations that the client sent to this vendor
                    .OrderByDescending(q => q.OrderDate)
                    .Select(q => new
                    {
                        orderID = q.OrderID,
                        quotationNumber = q.PONumber,
                        vendorID = q.VendorID,
                        vendorCode = q.vendorcode ?? "",
                        vendorName = q.VendorName ?? "",
                        orderDate = q.OrderDate,
                        totalAmount = q.TotalAmount,
                        status = q.Status ?? "Draft",
                        vendorRefNo = "",
                        isConverted = q.isconverted ?? 0,
                        convertedOrderId = q.convertedOrderId,
                        locationId = q.locationid,
                        quotationType = q.VendorOrderType ?? "Material",
                        parentQuotationID = q.ParentQuotationID
                    })
                    .ToList();

                return Ok(new { result = quotations });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetVendorQuotationById")]
        public IActionResult GetVendorQuotationById([FromQuery] int quotationId, [FromQuery] int tenantId = 0)
        {
            try
            {
                Console.WriteLine($"GetVendorQuotationById: Looking for quotationId {quotationId}, tenantId {tenantId}");

                // Use a safer query approach that handles NULL values
                VendorQuotations quotation = null;
                try
                {
                    var query = _context.VendorQuotations
                        .AsNoTracking() // Use AsNoTracking to avoid tracking issues with NULL values
                        .Where(q => q.OrderID == quotationId);
                    
                    // If tenantId is provided, filter by it; otherwise allow any tenant (for vendor portal)
                    if (tenantId > 0)
                    {
                        query = query.Where(q => q.Tenantid == tenantId);
                        Console.WriteLine($"GetVendorQuotationById: Filtering by tenantId {tenantId}");
                    }

                    quotation = query.FirstOrDefault();
                }
                catch (Exception queryEx)
                {
                    Console.WriteLine($"GetVendorQuotationById: Error querying VendorQuotations table: {queryEx.Message}");
                    Console.WriteLine($"GetVendorQuotationById: Stack trace: {queryEx.StackTrace}");
                    // Try using raw SQL as fallback with explicit NULL handling
                    try
                    {
                        // Use ISNULL to convert NULL strings to empty strings for EF compatibility
                        var sql = tenantId > 0
                            ? @"SELECT OrderID, DueDate, OrderDate, POInitiated, PONumber, 
                                       ISNULL(Status, '') as Status, Tenantid, TotalAmount, UserId, UserToken, VendorID,
                                       ISNULL(VendorName, '') as VendorName, ISNULL(VendorOrderType, '') as VendorOrderType,
                                       ISNULL(VendorPoNumber, '') as VendorPoNumber, ISNULL(address, '') as address,
                                       ISNULL(contactName, '') as contactName, convertedOrderId, isSent, isconverted,
                                       locationid, sentDate, ISNULL(ship_via, '') as ship_via,
                                       ISNULL(shippingInstructions, '') as shippingInstructions, ISNULL(vendorcode, '') as vendorcode,
                                       ParentQuotationID, AdditionalNotes, AttachmentsJson, CommentsJson
                                FROM VendorQuotations WHERE OrderID = {0} AND Tenantid = {1}"
                            : @"SELECT OrderID, DueDate, OrderDate, POInitiated, PONumber, 
                                       ISNULL(Status, '') as Status, Tenantid, TotalAmount, UserId, UserToken, VendorID,
                                       ISNULL(VendorName, '') as VendorName, ISNULL(VendorOrderType, '') as VendorOrderType,
                                       ISNULL(VendorPoNumber, '') as VendorPoNumber, ISNULL(address, '') as address,
                                       ISNULL(contactName, '') as contactName, convertedOrderId, isSent, isconverted,
                                       locationid, sentDate, ISNULL(ship_via, '') as ship_via,
                                       ISNULL(shippingInstructions, '') as shippingInstructions, ISNULL(vendorcode, '') as vendorcode,
                                       ParentQuotationID, AdditionalNotes, AttachmentsJson, CommentsJson
                                FROM VendorQuotations WHERE OrderID = {0}";
                        
                        var quotations = tenantId > 0
                            ? _context.VendorQuotations.FromSqlRaw(sql, quotationId, tenantId).ToList()
                            : _context.VendorQuotations.FromSqlRaw(sql, quotationId).ToList();
                        
                        quotation = quotations.FirstOrDefault();
                        Console.WriteLine($"GetVendorQuotationById: Fallback SQL query found quotation: {quotation != null}");
                    }
                    catch (Exception sqlEx)
                    {
                        Console.WriteLine($"GetVendorQuotationById: SQL fallback also failed: {sqlEx.Message}");
                        Console.WriteLine($"GetVendorQuotationById: SQL stack trace: {sqlEx.StackTrace}");
                        throw;
                    }
                }

                Console.WriteLine($"GetVendorQuotationById: After query - quotation is {(quotation == null ? "NULL" : "FOUND")}");
                
                if (quotation != null)
                {
                    Console.WriteLine($"GetVendorQuotationById: Found quotation - OrderID: {quotation.OrderID}, PONumber: {quotation.PONumber}, TenantId: {quotation.Tenantid}, VendorCode: {quotation.vendorcode ?? "NULL"}");
                    Console.WriteLine($"GetVendorQuotationById: ParentQuotationID from database: {quotation.ParentQuotationID}");
                }

                if (quotation == null)
                {
                    Console.WriteLine($"GetVendorQuotationById: Quotation not found for OrderID {quotationId} with tenantId {tenantId}");
                    return NotFound(new { error = "Quotation not found", quotationId = quotationId, tenantId = tenantId });
                }

                Console.WriteLine($"GetVendorQuotationById: Loading details for OrderID {quotationId}");
                var detailsQuery = _context.VendorQuotationsDetails.Where(d => d.OrderID == quotationId);
                
                // If tenantId is provided, filter by it; otherwise allow any tenant (for vendor portal)
                if (tenantId > 0)
                {
                    detailsQuery = detailsQuery.Where(d => d.Tenantid == tenantId);
                }
                
                List<object> details;
                try
                {
                    var detailsList = detailsQuery
                        .OrderBy(d => d.ItemNo)
                        .ToList(); // Materialize the query first to avoid SQL translation issues with nulls
                    
                    Console.WriteLine($"GetVendorQuotationById: Found {detailsList.Count} detail records");
                    
                    details = detailsList.Select(d => new
                    {
                        id = d.ID,
                        itemNo = d.ItemNo,
                        partName = d.itemname ?? "",
                        partNo = d.PartNo ?? "",
                        dueDate = d.DueDate ?? DateTime.Now,
                        jobNumber = d.JobNumber ?? "",
                        jobDesc = d.JobDesc ?? "",
                        qtyOrdered = d.QtyOrdered,
                        unit = d.Unit ?? "EA",
                        unitPrice = d.UnitPrice,
                        jobPriority = d.JobPriority,
                        discount = d.Discount,
                        discountType = string.IsNullOrWhiteSpace(d.DiscountType) ? "Percent" : d.DiscountType,
                        productId = d.productid,
                        leadTime = "",
                        notes = d.notes ?? "",
                        glcode = d.glcode ?? "",
                        attachments = !string.IsNullOrEmpty(d.AttachmentsJson) 
                            ? JsonSerializer.Deserialize<List<QuotationAttachmentDto>>(d.AttachmentsJson, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true })
                            : null
                    }).ToList<object>();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"GetVendorQuotationById: Error loading details: {ex.Message}");
                    Console.WriteLine($"GetVendorQuotationById: Stack trace: {ex.StackTrace}");
                    details = new List<object>();
                }

                // Load attachments from JSON
                List<QuotationAttachmentDto> attachments = null;
                try
                {
                    if (!string.IsNullOrEmpty(quotation.AttachmentsJson))
                    {
                        var options = new JsonSerializerOptions
                        {
                            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                            PropertyNameCaseInsensitive = true
                        };
                        attachments = JsonSerializer.Deserialize<List<QuotationAttachmentDto>>(quotation.AttachmentsJson, options);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error deserializing attachments: {ex.Message}");
                    attachments = null;
                }

                // Load comments from JSON
                List<QuotationCommentDto> comments = null;
                try
                {
                    if (!string.IsNullOrEmpty(quotation.CommentsJson))
                    {
                        var options = new JsonSerializerOptions
                        {
                            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                            PropertyNameCaseInsensitive = true
                        };
                        comments = JsonSerializer.Deserialize<List<QuotationCommentDto>>(quotation.CommentsJson, options);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error deserializing comments: {ex.Message}");
                    comments = null;
                }

                var result = new
                {
                    OrderID = quotation.OrderID,
                    Tenantid = quotation.Tenantid,
                    VendorID = quotation.VendorID,
                    VendorCode = quotation.vendorcode ?? "",
                    PONumber = quotation.PONumber,
                    VendorName = quotation.VendorName ?? "",
                    Address = quotation.address ?? "",
                    VendorPoNumber = quotation.VendorPoNumber ?? "",
                    OrderDate = quotation.OrderDate?.ToString("yyyy-MM-dd") ?? DateTime.Now.ToString("yyyy-MM-dd"),
                    TotalAmount = quotation.TotalAmount,
                    UserId = quotation.UserId,
                    UserToken = quotation.UserToken,
                    Status = quotation.Status ?? "Draft",
                    ShippingInstructions = quotation.shippingInstructions ?? "",
                    ExternalVendorPO = quotation.VendorPoNumber ?? "",
                    BuyerName = quotation.contactName ?? "",
                    VendorRefNo = "",
                    QuotationType = quotation.VendorOrderType ?? "Material",
                    AdditionalNotes = quotation.AdditionalNotes ?? "",
                    LocationId = quotation.locationid,
                    convertedOrderId = quotation.convertedOrderId,
                    ParentQuotationID = quotation.ParentQuotationID,
                    Details = details,
                    Attachments = attachments != null ? attachments.Select(a => new
                    {
                        id = a.Id,
                        name = a.Name,
                        size = a.Size,
                        fileUrl = a.FileUrl
                    }).ToList() : null,
                    Comments = comments != null ? comments.Select(c => new
                    {
                        id = c.Id,
                        text = c.Text,
                        createdAt = c.CreatedAt,
                        createdBy = c.CreatedBy
                    }).ToList() : null
                };

                Console.WriteLine($"GetVendorQuotationById: Created result object with ParentQuotationID: {result.ParentQuotationID}");
                Console.WriteLine($"GetVendorQuotationById: Result object has property ParentQuotationID: {result.GetType().GetProperties().Any(p => p.Name == "ParentQuotationID")}");

                Console.WriteLine($"GetVendorQuotationById: Successfully created result object");
                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"GetVendorQuotationById: EXCEPTION - {ex.Message}");
                Console.WriteLine($"GetVendorQuotationById: Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"GetVendorQuotationById: Inner exception: {ex.InnerException.Message}");
                    Console.WriteLine($"GetVendorQuotationById: Inner stack trace: {ex.InnerException.StackTrace}");
                }
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpPost("SaveVendorQuotation")]
        public IActionResult SaveVendorQuotation([FromBody] JsonElement request)
        {
            try
            {
                if (request.ValueKind == JsonValueKind.Null || request.ValueKind == JsonValueKind.Undefined)
                {
                    return BadRequest(new { error = "Request is null" });
                }

                // Debug: Log the entire request to see what we're receiving
                Console.WriteLine($"Received SaveVendorQuotation request: {request}");
                if (request.TryGetProperty("Details", out JsonElement detailsDebug))
                {
                    Console.WriteLine($"Details array length: {detailsDebug.GetArrayLength()}");
                    if (detailsDebug.GetArrayLength() > 0)
                    {
                        var firstDetail = detailsDebug[0];
                        Console.WriteLine($"First detail keys: {string.Join(", ", firstDetail.EnumerateObject().Select(p => p.Name))}");
                        if (firstDetail.TryGetProperty("partNo", out JsonElement partNoDebug))
                        {
                            Console.WriteLine($"First detail partNo (camelCase): {partNoDebug}");
                        }
                        if (firstDetail.TryGetProperty("PartNo", out JsonElement partNoDebugUpper))
                        {
                            Console.WriteLine($"First detail PartNo (PascalCase): {partNoDebugUpper}");
                        }
                    }
                }

                // Extract basic fields
                int orderID = request.TryGetProperty("OrderID", out JsonElement orderIDElem) ? orderIDElem.GetInt32() : 0;
                int tenantid = request.TryGetProperty("Tenantid", out JsonElement tenantidElem) ? tenantidElem.GetInt32() : 0;
                int vendorID = request.TryGetProperty("VendorID", out JsonElement vendorIDElem) ? vendorIDElem.GetInt32() : 0;

                if (vendorID <= 0)
                {
                    return BadRequest(new { error = "Vendor is required" });
                }

                if (!request.TryGetProperty("Details", out JsonElement detailsElem) || detailsElem.ValueKind != JsonValueKind.Array || detailsElem.GetArrayLength() == 0)
                {
                    return BadRequest(new { error = "At least one detail item is required" });
                }

                VendorQuotations quotation;

                if (orderID > 0)
                {
                    // Update existing quotation - use safer query approach
                    try
                    {
                        var query = _context.VendorQuotations
                            .AsNoTracking()
                            .Where(q => q.OrderID == orderID);
                        if (tenantid > 0)
                        {
                            query = query.Where(q => q.Tenantid == tenantid);
                        }
                        quotation = query.FirstOrDefault();
                    }
                    catch (Exception queryEx)
                    {
                        Console.WriteLine($"SaveVendorQuotation: Error querying existing quotation: {queryEx.Message}");
                        // Try SQL fallback
                        try
                        {
                            var sql = tenantid > 0
                                ? @"SELECT OrderID, DueDate, OrderDate, POInitiated, PONumber, 
                                           ISNULL(Status, '') as Status, Tenantid, TotalAmount, UserId, UserToken, VendorID,
                                           ISNULL(VendorName, '') as VendorName, ISNULL(VendorOrderType, '') as VendorOrderType,
                                           ISNULL(VendorPoNumber, '') as VendorPoNumber, ISNULL(address, '') as address,
                                           ISNULL(contactName, '') as contactName, convertedOrderId, isSent, isconverted,
                                           locationid, sentDate, ISNULL(ship_via, '') as ship_via,
                                           ISNULL(shippingInstructions, '') as shippingInstructions, ISNULL(vendorcode, '') as vendorcode,
                                           ParentQuotationID, AdditionalNotes, AttachmentsJson, CommentsJson
                                    FROM VendorQuotations WHERE OrderID = {0} AND Tenantid = {1}"
                                : @"SELECT OrderID, DueDate, OrderDate, POInitiated, PONumber, 
                                           ISNULL(Status, '') as Status, Tenantid, TotalAmount, UserId, UserToken, VendorID,
                                           ISNULL(VendorName, '') as VendorName, ISNULL(VendorOrderType, '') as VendorOrderType,
                                           ISNULL(VendorPoNumber, '') as VendorPoNumber, ISNULL(address, '') as address,
                                           ISNULL(contactName, '') as contactName, convertedOrderId, isSent, isconverted,
                                           locationid, sentDate, ISNULL(ship_via, '') as ship_via,
                                           ISNULL(shippingInstructions, '') as shippingInstructions, ISNULL(vendorcode, '') as vendorcode,
                                           ParentQuotationID, AdditionalNotes, AttachmentsJson, CommentsJson
                                    FROM VendorQuotations WHERE OrderID = {0}";
                            
                            var quotations = tenantid > 0
                                ? _context.VendorQuotations.FromSqlRaw(sql, orderID, tenantid).ToList()
                                : _context.VendorQuotations.FromSqlRaw(sql, orderID).ToList();
                            
                            quotation = quotations.FirstOrDefault();
                        }
                        catch (Exception sqlEx)
                        {
                            Console.WriteLine($"SaveVendorQuotation: SQL fallback also failed: {sqlEx.Message}");
                            return StatusCode(500, new { error = "Error loading quotation: " + queryEx.Message });
                        }
                    }

                    if (quotation == null)
                    {
                        return NotFound(new { error = "Vendor quotation not found" });
                    }
                    
                    // Re-attach the entity for update
                    _context.VendorQuotations.Attach(quotation);
                    _context.Entry(quotation).State = Microsoft.EntityFrameworkCore.EntityState.Modified;
                }
                else
                {
                    // Get next PO Number - use safer query approach
                    List<VendorQuotations> existingQuotations = null;
                    try
                    {
                        existingQuotations = _context.VendorQuotations
                            .AsNoTracking()
                            .Where(q => q.Tenantid == tenantid)
                            .ToList();
                    }
                    catch (Exception queryEx)
                    {
                        Console.WriteLine($"SaveVendorQuotation: Error querying for PO number: {queryEx.Message}");
                        // Use SQL fallback
                        try
                        {
                            var sql = @"SELECT OrderID, DueDate, OrderDate, POInitiated, PONumber, 
                                               ISNULL(Status, '') as Status, Tenantid, TotalAmount, UserId, UserToken, VendorID,
                                               ISNULL(VendorName, '') as VendorName, ISNULL(VendorOrderType, '') as VendorOrderType,
                                               ISNULL(VendorPoNumber, '') as VendorPoNumber, ISNULL(address, '') as address,
                                               ISNULL(contactName, '') as contactName, convertedOrderId, isSent, isconverted,
                                               locationid, sentDate, ISNULL(ship_via, '') as ship_via,
                                               ISNULL(shippingInstructions, '') as shippingInstructions, ISNULL(vendorcode, '') as vendorcode,
                                               ParentQuotationID, AdditionalNotes, AttachmentsJson, CommentsJson
                                        FROM VendorQuotations WHERE Tenantid = {0}";
                            existingQuotations = _context.VendorQuotations.FromSqlRaw(sql, tenantid).ToList();
                        }
                        catch (Exception sqlEx)
                        {
                            Console.WriteLine($"SaveVendorQuotation: SQL fallback for PO number failed: {sqlEx.Message}");
                            existingQuotations = new List<VendorQuotations>();
                        }
                    }

                    int nextPONumber;
                    if (existingQuotations != null && existingQuotations.Any())
                    {
                        var maxPONumber = existingQuotations.Max(q => q.PONumber);
                        nextPONumber = Math.Max(1000, maxPONumber + 1);
                    }
                    else
                    {
                        nextPONumber = 1000;
                    }

                    // Create new quotation
                    quotation = new VendorQuotations
                    {
                        Tenantid = tenantid,
                        PONumber = nextPONumber,
                        UserId = request.TryGetProperty("UserId", out JsonElement userIdElem) ? userIdElem.GetInt32() : 0,
                        UserToken = request.TryGetProperty("UserToken", out JsonElement userTokenElem) ? userTokenElem.GetInt32() : 0,
                        ship_via = "",
                        VendorOrderType = request.TryGetProperty("QuotationType", out JsonElement quotationTypeElem) ? quotationTypeElem.GetString() ?? "Material" : "Material",
                        isSent = false
                    };
                    _context.VendorQuotations.Add(quotation);
                }

                // Update fields
                quotation.VendorID = vendorID;
                quotation.vendorcode = request.TryGetProperty("VendorCode", out JsonElement vendorCodeElem) ? vendorCodeElem.GetString() ?? "" : "";
                quotation.VendorName = request.TryGetProperty("VendorName", out JsonElement vendorNameElem) ? vendorNameElem.GetString() ?? "" : "";
                quotation.address = request.TryGetProperty("Address", out JsonElement addressElem) ? addressElem.GetString() ?? "" : "";
                quotation.VendorPoNumber = request.TryGetProperty("VendorPoNumber", out JsonElement vendorPoNumberElem) ? vendorPoNumberElem.GetString() ?? "" : "";
                
                if (request.TryGetProperty("OrderDate", out JsonElement orderDateElem))
                {
                    if (orderDateElem.ValueKind == JsonValueKind.String && DateTime.TryParse(orderDateElem.GetString(), out DateTime orderDate))
                    {
                        quotation.OrderDate = orderDate;
                        // If DueDate is not provided, use OrderDate
                        DateTime dueDate = orderDate; // Initialize with orderDate as default
                        if (request.TryGetProperty("ExternalOrderDate", out JsonElement dueDateElem))
                        {
                            if (DateTime.TryParse(dueDateElem.GetString(), out DateTime parsedDueDate))
                            {
                                dueDate = parsedDueDate;
                            }
                        }
                        quotation.DueDate = dueDate;
                    }
                }

                quotation.TotalAmount = request.TryGetProperty("TotalAmount", out JsonElement totalAmountElem) ? totalAmountElem.GetDecimal() : 0;
                quotation.Status = request.TryGetProperty("Status", out JsonElement statusElem) ? statusElem.GetString() ?? "Draft" : "Draft";
                quotation.shippingInstructions = request.TryGetProperty("ShippingInstructions", out JsonElement shippingInstructionsElem) ? shippingInstructionsElem.GetString() ?? "" : "";
                quotation.contactName = request.TryGetProperty("BuyerName", out JsonElement buyerNameElem) ? buyerNameElem.GetString() ?? "" : "";
                quotation.VendorOrderType = request.TryGetProperty("QuotationType", out JsonElement quotationTypeElem2) ? quotationTypeElem2.GetString() ?? "Material" : "Material";
                quotation.AdditionalNotes = request.TryGetProperty("AdditionalNotes", out JsonElement additionalNotesElem) ? additionalNotesElem.GetString() ?? "" : null;
                var requestedVendorQuoteLoc = request.TryGetProperty("LocationId", out JsonElement locationIdElem) && locationIdElem.ValueKind == JsonValueKind.Number
                    ? locationIdElem.GetInt32()
                    : (int?)null;
                if (!TryResolveLocationId(requestedVendorQuoteLoc, out var resolvedVendorQuoteLoc, out var forbidVendorQuoteLoc))
                    return forbidVendorQuoteLoc!;
                quotation.locationid = resolvedVendorQuoteLoc > 0 ? resolvedVendorQuoteLoc : requestedVendorQuoteLoc;
                // Only update convertedOrderId if it's provided and valid
                // CRITICAL: Backend SaveVendorOrder already sets this correctly with PONumber
                // If convertedOrderId is already set and the incoming value is an OrderID (likely > 1000 or matches a pattern),
                // DO NOT overwrite it as it would replace the correct PONumber with an OrderID
                if (request.TryGetProperty("convertedOrderId", out JsonElement convertedOrderIdElem) && convertedOrderIdElem.ValueKind == JsonValueKind.Number)
                {
                    int convertedId = convertedOrderIdElem.GetInt32();
                    if (convertedId > 0)
                    {
                        // Check if the existing convertedOrderId is already set and is a valid PONumber (typically < 100 or in a specific range)
                        // If the incoming value looks like an OrderID (large number, e.g., > 1000) and we already have a smaller value,
                        // it's likely an OrderID being sent instead of PONumber - don't overwrite
                        bool shouldUpdate = true;
                        if (quotation.convertedOrderId.HasValue && quotation.convertedOrderId.Value > 0)
                        {
                            int existingValue = quotation.convertedOrderId.Value;
                            // If existing value is small (< 100) and incoming is large (> 1000), incoming is likely OrderID
                            if (existingValue < 100 && convertedId > 1000)
                            {
                                Console.WriteLine($"[SaveVendorQuotation] WARNING: Attempted to overwrite convertedOrderId {existingValue} (PONumber) with {convertedId} (likely OrderID). Rejecting update to preserve correct PONumber.");
                                shouldUpdate = false;
                            }
                            // If existing value equals the incoming value, no need to update
                            else if (existingValue == convertedId)
                            {
                                Console.WriteLine($"[SaveVendorQuotation] convertedOrderId already set to {convertedId}, skipping update");
                                shouldUpdate = false;
                            }
                        }
                        
                        if (shouldUpdate)
                        {
                            quotation.convertedOrderId = convertedId;
                            Console.WriteLine($"[SaveVendorQuotation] Set convertedOrderId to: {convertedId}");
                        }
                    }
                    else
                    {
                        Console.WriteLine($"[SaveVendorQuotation] Ignoring invalid convertedOrderId: {convertedId}");
                    }
                }
                // If not provided, leave existing value unchanged (don't set to null)
                Console.WriteLine($"[SaveVendorQuotation] Processing quotation {orderID}");
                var parentQuotationIDFromRequest = request.TryGetProperty("ParentQuotationID", out JsonElement parentQuotationIDElem) && parentQuotationIDElem.ValueKind == JsonValueKind.Number ? parentQuotationIDElem.GetInt32() : (int?)null;
                Console.WriteLine($"[SaveVendorQuotation] ParentQuotationID from request: {parentQuotationIDFromRequest}");
                quotation.ParentQuotationID = parentQuotationIDFromRequest;
                Console.WriteLine($"[SaveVendorQuotation] ParentQuotationID set to: {quotation.ParentQuotationID}");

                // Save attachments as JSON
                if (request.TryGetProperty("Attachments", out JsonElement attachmentsElem) && attachmentsElem.ValueKind == JsonValueKind.Array && attachmentsElem.GetArrayLength() > 0)
                {
                    var attachmentOptions = new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                        PropertyNameCaseInsensitive = true,
                        WriteIndented = false
                    };
                    quotation.AttachmentsJson = JsonSerializer.Serialize(attachmentsElem, attachmentOptions);
                }
                else
                {
                    quotation.AttachmentsJson = null;
                }

                // Save comments as JSON
                if (request.TryGetProperty("Comments", out JsonElement commentsElem) && commentsElem.ValueKind == JsonValueKind.Array && commentsElem.GetArrayLength() > 0)
                {
                    var commentOptions = new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                        WriteIndented = false
                    };
                    quotation.CommentsJson = JsonSerializer.Serialize(commentsElem, commentOptions);
                }
                else
                {
                    quotation.CommentsJson = null;
                }

                _context.SaveChanges();

                // Handle details
                var detailsArray = request.GetProperty("Details").EnumerateArray().ToList();
                if (detailsArray.Count > 0)
                {
                    // Delete existing details - use safer query approach
                    List<VendorQuotationsDetails> existingDetails = null;
                    try
                    {
                        var detailsQuery = _context.VendorQuotationsDetails
                            .AsNoTracking()
                            .Where(d => d.OrderID == quotation.OrderID);
                        if (tenantid > 0)
                        {
                            detailsQuery = detailsQuery.Where(d => d.Tenantid == tenantid);
                        }
                        existingDetails = detailsQuery.ToList();
                    }
                    catch (Exception detailsEx)
                    {
                        Console.WriteLine($"SaveVendorQuotation: Error querying existing details: {detailsEx.Message}");
                        // Try SQL fallback
                        try
                        {
                            var sql = tenantid > 0
                                ? @"SELECT ID, OrderID, ItemNo, ISNULL(itemname, '') as itemname, ISNULL(PartNo, '') as PartNo,
                                          DueDate, ISNULL(JobNumber, '') as JobNumber, ISNULL(JobDesc, '') as JobDesc,
                                          QtyOrdered, ISNULL(Unit, '') as Unit, UnitPrice, JobPriority, Discount,
                                          ISNULL(glcode, '') as glcode, JobId, ISNULL(Received, '') as Received,
                                          ReceivedQty, Tenantid, jobdetailId, productid, Groupid, IsAdditionItem,
                                          ISNULL(notes, '') as notes, AttachmentsJson
                                   FROM VendorQuotationsDetails WHERE OrderID = {0} AND Tenantid = {1}"
                                : @"SELECT ID, OrderID, ItemNo, ISNULL(itemname, '') as itemname, ISNULL(PartNo, '') as PartNo,
                                          DueDate, ISNULL(JobNumber, '') as JobNumber, ISNULL(JobDesc, '') as JobDesc,
                                          QtyOrdered, ISNULL(Unit, '') as Unit, UnitPrice, JobPriority, Discount,
                                          ISNULL(glcode, '') as glcode, JobId, ISNULL(Received, '') as Received,
                                          ReceivedQty, Tenantid, jobdetailId, productid, Groupid, IsAdditionItem,
                                          ISNULL(notes, '') as notes, AttachmentsJson
                                   FROM VendorQuotationsDetails WHERE OrderID = {0}";
                            
                            existingDetails = tenantid > 0
                                ? _context.VendorQuotationsDetails.FromSqlRaw(sql, quotation.OrderID, tenantid).ToList()
                                : _context.VendorQuotationsDetails.FromSqlRaw(sql, quotation.OrderID).ToList();
                        }
                        catch (Exception sqlEx)
                        {
                            Console.WriteLine($"SaveVendorQuotation: SQL fallback also failed: {sqlEx.Message}");
                            existingDetails = new List<VendorQuotationsDetails>();
                        }
                    }
                    
                    if (existingDetails != null && existingDetails.Any())
                    {
                        _context.VendorQuotationsDetails.RemoveRange(existingDetails);
                    }

                    // Add new details
                    foreach (var detailElem in detailsArray)
                    {
                        // Get PartNo - check both camelCase (from JSON) and PascalCase (fallback)
                        string partNoValue = null;
                        if (detailElem.TryGetProperty("partNo", out JsonElement partNoElemLower))
                        {
                            if (partNoElemLower.ValueKind == JsonValueKind.String)
                            {
                                partNoValue = partNoElemLower.GetString();
                            }
                            else if (partNoElemLower.ValueKind == JsonValueKind.Null)
                            {
                                partNoValue = null;
                            }
                        }
                        else if (detailElem.TryGetProperty("PartNo", out JsonElement partNoElemUpper))
                        {
                            if (partNoElemUpper.ValueKind == JsonValueKind.String)
                            {
                                partNoValue = partNoElemUpper.GetString();
                            }
                            else if (partNoElemUpper.ValueKind == JsonValueKind.Null)
                            {
                                partNoValue = null;
                            }
                        }
                        
                        // Debug logging
                        int itemNoDebug = detailElem.TryGetProperty("itemNo", out JsonElement itemNoDebugLower) ? itemNoDebugLower.GetInt32() : (detailElem.TryGetProperty("ItemNo", out JsonElement itemNoDebugUpper) ? itemNoDebugUpper.GetInt32() : 0);
                        Console.WriteLine($"Processing detail ItemNo: {itemNoDebug}");
                        string partNoDebugMsg = string.IsNullOrEmpty(partNoValue) ? "NULL or EMPTY" : partNoValue;
                        Console.WriteLine($"PartNo value extracted: {partNoDebugMsg}");
                        
                        var detail = new VendorQuotationsDetails
                        {
                            OrderID = quotation.OrderID,
                            Tenantid = tenantid,
                            ItemNo = detailElem.TryGetProperty("ItemNo", out JsonElement itemNoElem) ? itemNoElem.GetInt32() : (detailElem.TryGetProperty("itemNo", out JsonElement itemNoElemLower) ? itemNoElemLower.GetInt32() : 0),
                            itemname = detailElem.TryGetProperty("PartName", out JsonElement partNameElem) ? partNameElem.GetString() ?? "" : (detailElem.TryGetProperty("partName", out JsonElement partNameElemLower) ? partNameElemLower.GetString() ?? "" : ""),
                            glcode = detailElem.TryGetProperty("glcode", out JsonElement glcodeElem) && glcodeElem.ValueKind == JsonValueKind.String
                                ? (glcodeElem.GetString() ?? "")
                                : (detailElem.TryGetProperty("Glcode", out JsonElement glcodeElemUpper) && glcodeElemUpper.ValueKind == JsonValueKind.String
                                    ? (glcodeElemUpper.GetString() ?? "")
                                    : ""),
                            JobId = 0,
                            JobNumber = detailElem.TryGetProperty("JobNumber", out JsonElement jobNumberElem) ? jobNumberElem.GetString() ?? "" : (detailElem.TryGetProperty("jobNumber", out JsonElement jobNumberElemLower) ? jobNumberElemLower.GetString() ?? "" : ""),
                            JobDesc = detailElem.TryGetProperty("JobDesc", out JsonElement jobDescElem) ? jobDescElem.GetString() ?? "" : (detailElem.TryGetProperty("jobDesc", out JsonElement jobDescElemLower) ? jobDescElemLower.GetString() ?? "" : ""),
                            QtyOrdered = detailElem.TryGetProperty("QtyOrdered", out JsonElement qtyOrderedElem) ? qtyOrderedElem.GetInt32() : (detailElem.TryGetProperty("qtyOrdered", out JsonElement qtyOrderedElemLower) ? qtyOrderedElemLower.GetInt32() : 0),
                            Unit = detailElem.TryGetProperty("Unit", out JsonElement unitElem) ? unitElem.GetString() ?? "EA" : (detailElem.TryGetProperty("unit", out JsonElement unitElemLower) ? unitElemLower.GetString() ?? "EA" : "EA"),
                            UnitPrice = detailElem.TryGetProperty("UnitPrice", out JsonElement unitPriceElem) ? unitPriceElem.GetDecimal() : (detailElem.TryGetProperty("unitPrice", out JsonElement unitPriceElemLower) ? unitPriceElemLower.GetDecimal() : 0),
                            JobPriority = detailElem.TryGetProperty("JobPriority", out JsonElement jobPriorityElem) ? jobPriorityElem.GetInt32() : (detailElem.TryGetProperty("jobPriority", out JsonElement jobPriorityElemLower) ? jobPriorityElemLower.GetInt32() : 0),
                            Discount = detailElem.TryGetProperty("Discount", out JsonElement discountElem) ? discountElem.GetDecimal() : (detailElem.TryGetProperty("discount", out JsonElement discountElemLower) ? discountElemLower.GetDecimal() : 0),
                            DiscountType = detailElem.TryGetProperty("DiscountType", out JsonElement discountTypeElem) && discountTypeElem.ValueKind == JsonValueKind.String
                                ? (string.Equals(discountTypeElem.GetString(), "Amount", StringComparison.OrdinalIgnoreCase) ? "Amount" : "Percent")
                                : (detailElem.TryGetProperty("discountType", out JsonElement discountTypeElemLower) && discountTypeElemLower.ValueKind == JsonValueKind.String
                                    ? (string.Equals(discountTypeElemLower.GetString(), "Amount", StringComparison.OrdinalIgnoreCase) ? "Amount" : "Percent")
                                    : "Percent"),
                            Received = "",
                            productid = detailElem.TryGetProperty("ProductId", out JsonElement productIdElem) && productIdElem.ValueKind == JsonValueKind.Number ? productIdElem.GetInt32() : (detailElem.TryGetProperty("productId", out JsonElement productIdElemLower) && productIdElemLower.ValueKind == JsonValueKind.Number ? productIdElemLower.GetInt32() : (int?)null),
                            notes = detailElem.TryGetProperty("Notes", out JsonElement notesElem) && notesElem.ValueKind == JsonValueKind.String ? notesElem.GetString() : (detailElem.TryGetProperty("notes", out JsonElement notesElemLower) && notesElemLower.ValueKind == JsonValueKind.String ? notesElemLower.GetString() : null),
                            PartNo = partNoValue
                        };

                        // Save line item attachments as JSON
                        if (detailElem.TryGetProperty("Attachments", out JsonElement detailAttachmentsElem) && detailAttachmentsElem.ValueKind == JsonValueKind.Array && detailAttachmentsElem.GetArrayLength() > 0)
                        {
                            var attachmentOptions = new JsonSerializerOptions
                            {
                                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                                PropertyNameCaseInsensitive = true,
                                WriteIndented = false
                            };
                            detail.AttachmentsJson = JsonSerializer.Serialize(detailAttachmentsElem, attachmentOptions);
                            Console.WriteLine($"Saved line item attachments for ItemNo {detail.ItemNo}, OrderID {detail.OrderID}: {detail.AttachmentsJson}");
                        }
                        else
                        {
                            detail.AttachmentsJson = null;
                            Console.WriteLine($"No attachments found for ItemNo {detail.ItemNo}, OrderID {detail.OrderID}");
                        }
                        
                        string partNoMsg = string.IsNullOrEmpty(detail.PartNo) ? "NULL or EMPTY" : detail.PartNo;
                        string notesMsg = string.IsNullOrEmpty(detail.notes) ? "NULL or EMPTY" : detail.notes;
                        Console.WriteLine($"Created detail object - ItemNo: {detail.ItemNo}, PartNo: {partNoMsg}, Notes: {notesMsg}");

                        DateTime detailDueDate = quotation.OrderDate ?? DateTime.Now; // Initialize with OrderDate as default
                        if (detailElem.TryGetProperty("DueDate", out JsonElement detailDueDateElem))
                        {
                            if (DateTime.TryParse(detailDueDateElem.GetString(), out DateTime parsedDetailDueDate))
                            {
                                detailDueDate = parsedDetailDueDate;
                            }
                        }
                        detail.DueDate = detailDueDate;

                        _context.VendorQuotationsDetails.Add(detail);
                    }

                    _context.SaveChanges();
                    Console.WriteLine("Details saved successfully. Verifying PartNo was saved...");
                    
                    // Verify PartNo was saved by querying back
                    var savedDetails = _context.VendorQuotationsDetails
                        .Where(d => d.OrderID == quotation.OrderID && d.Tenantid == tenantid)
                        .ToList();
                    foreach (var saved in savedDetails)
                    {
                        string savedPartNoMsg = string.IsNullOrEmpty(saved.PartNo) ? "NULL or EMPTY" : saved.PartNo;
                        Console.WriteLine($"Saved detail ItemNo: {saved.ItemNo}, PartNo: {savedPartNoMsg}");
                    }
                }

                // Handle multi-vendor quotation status updates
                // When a quotation is accepted, automatically reject other quotations in the same group
                if (quotation.Status == "Accepted")
                {
                    List<VendorQuotations> quotationsToUpdate = new List<VendorQuotations>();
                    
                    if (quotation.ParentQuotationID.HasValue)
                    {
                        // This is a child quotation - find all sibling quotations (same parent)
                        var siblingQuotations = _context.VendorQuotations
                            .Where(q => q.ParentQuotationID == quotation.ParentQuotationID 
                                     && q.OrderID != quotation.OrderID 
                                     && q.Tenantid == tenantid
                                     && q.Status != "Accepted" // Don't update already accepted ones
                                     && q.Status != "Converted") // Don't update converted ones
                            .ToList();
                        
                        quotationsToUpdate.AddRange(siblingQuotations);
                        
                        if (siblingQuotations.Any())
                        {
                            Console.WriteLine($"[SaveVendorQuotation] Found {siblingQuotations.Count} sibling quotation(s) to update after accepting quotation {quotation.OrderID}");
                        }
                    }
                    else
                    {
                        // This is a master quotation - find all child quotations
                        var childQuotations = _context.VendorQuotations
                            .Where(q => q.ParentQuotationID == quotation.OrderID 
                                     && q.Tenantid == tenantid
                                     && q.Status != "Accepted" // Don't update already accepted ones
                                     && q.Status != "Converted") // Don't update converted ones
                            .ToList();
                        
                        quotationsToUpdate.AddRange(childQuotations);
                        
                        if (childQuotations.Any())
                        {
                            Console.WriteLine($"[SaveVendorQuotation] Found {childQuotations.Count} child quotation(s) to update after accepting master quotation {quotation.OrderID}");
                        }
                    }
                    
                    // Update all related quotations to "Rejected"
                    if (quotationsToUpdate.Any())
                    {
                        foreach (var relatedQuotation in quotationsToUpdate)
                        {
                            relatedQuotation.Status = "Rejected";
                            _context.Entry(relatedQuotation).State = Microsoft.EntityFrameworkCore.EntityState.Modified;
                            Console.WriteLine($"[SaveVendorQuotation] Updating quotation {relatedQuotation.OrderID} status to 'Rejected'");
                        }
                        
                        _context.SaveChanges();
                        Console.WriteLine($"[SaveVendorQuotation] Successfully updated {quotationsToUpdate.Count} related quotation(s) to 'Rejected'");
                    }
                }

                return Ok(new { result = new { id = quotation.OrderID, message = "Vendor quotation saved successfully" } });
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

        [HttpGet("CheckVendorQuotationDeletionImpact")]
        public IActionResult CheckVendorQuotationDeletionImpact([FromQuery] int quotationId, [FromQuery] int tenantId)
        {
            try
            {
                var quotation = _context.VendorQuotations
                    .FirstOrDefault(q => q.OrderID == quotationId && q.Tenantid == tenantId);

                if (quotation == null)
                {
                    return NotFound(new { error = "Vendor quotation not found" });
                }

                var impact = new DeletionImpactResult
                {
                    CanDelete = true,
                    BlockingReasons = new List<string>(),
                    BlockingDependencies = new List<BlockingDependency>(),
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                // Check if quotation is referenced by VendorOrder
                var referencedOrders = _context.VendorOrders
                    .Where(vo => (vo.ParentQuotationID == quotationId || vo.QuotationId == quotationId) && vo.Tenantid == tenantId)
                    .ToList();
                
                if (referencedOrders.Any())
                {
                    var orderDependency = new BlockingDependency
                    {
                        EntityType = "VendorOrder",
                        Description = $"Vendor quotation is referenced by {referencedOrders.Count} vendor order(s)",
                        Items = referencedOrders.Select(o => new DependencyItem
                        {
                            Id = o.OrderID,
                            Name = $"VO#{o.PONumber}",
                            DeleteEndpoint = $"/Order/DeleteVendorOrder?orderId={o.OrderID}&tenantId={tenantId}"
                        }).ToList()
                    };
                    
                    impact.BlockingDependencies.Add(orderDependency);
                    var orderNumbers = referencedOrders.Select(o => $"VO#{o.PONumber}").ToList();
                    impact.BlockingReasons.Add(
                        $"Vendor quotation is referenced by {referencedOrders.Count} vendor order(s): {string.Join(", ", orderNumbers)}. Remove the reference first or delete the orders."
                    );
                    impact.CanDelete = false;
                }

                // Check if quotation has been converted to an order
                if (quotation.isconverted == 1 && quotation.convertedOrderId.HasValue)
                {
                    var convertedOrder = _context.VendorOrders
                        .FirstOrDefault(vo => vo.OrderID == quotation.convertedOrderId.Value && vo.Tenantid == tenantId);
                    
                    if (convertedOrder == null)
                    {
                        // Check by PONumber if OrderID doesn't match
                        convertedOrder = _context.VendorOrders
                            .FirstOrDefault(vo => vo.PONumber == quotation.convertedOrderId.Value && vo.Tenantid == tenantId);
                    }
                    
                    if (convertedOrder != null)
                    {
                        var convertedDependency = new BlockingDependency
                        {
                            EntityType = "VendorOrder",
                            Description = "Vendor quotation has been converted to a vendor order",
                            Items = new List<DependencyItem>
                            {
                                new DependencyItem
                                {
                                    Id = convertedOrder.OrderID,
                                    Name = $"VO#{convertedOrder.PONumber}",
                                    DeleteEndpoint = $"/Order/DeleteVendorOrder?orderId={convertedOrder.OrderID}&tenantId={tenantId}"
                                }
                            }
                        };
                        
                        impact.BlockingDependencies.Add(convertedDependency);
                        impact.BlockingReasons.Add(
                            $"Vendor quotation has been converted to Vendor Order VO#{convertedOrder.PONumber}. Delete the order first."
                        );
                        impact.CanDelete = false;
                    }
                }

                // If can delete, list what will be deleted
                if (impact.CanDelete)
                {
                    var detailCount = _context.VendorQuotationsDetails
                        .Count(d => d.OrderID == quotationId && d.Tenantid == tenantId);
                    if (detailCount > 0)
                    {
                        impact.WillBeDeleted.Add(new ImpactedEntity
                        {
                            EntityType = "Quotation Details",
                            Count = detailCount,
                            Description = $"{detailCount} line item(s) will be deleted"
                        });
                    }

                    impact.Warnings.Add("This action cannot be undone");
                }

                return Ok(new { result = impact });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpDelete("DeleteVendorQuotation")]
        public IActionResult DeleteVendorQuotation([FromQuery] int quotationId, [FromQuery] int tenantId)
        {
            try
            {
                var quotation = _context.VendorQuotations
                    .FirstOrDefault(q => q.OrderID == quotationId && q.Tenantid == tenantId);

                if (quotation == null)
                {
                    return NotFound(new { error = "Quotation not found" });
                }

                // Delete details first
                var details = _context.VendorQuotationsDetails
                    .Where(d => d.OrderID == quotationId && d.Tenantid == tenantId)
                    .ToList();

                _context.VendorQuotationsDetails.RemoveRange(details);
                _context.VendorQuotations.Remove(quotation);
                _context.SaveChanges();

                return Ok(new { result = "Vendor quotation deleted successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("ConvertVendorQuotationToOrder")]
        public IActionResult ConvertVendorQuotationToOrder([FromQuery] int quotationId, [FromBody] dynamic requestData)
        {
            try
            {
                Console.WriteLine($"ConvertVendorQuotationToOrder: Converting quotation {quotationId} to vendor order");

                // Get the quotation data
                var quotation = _context.VendorQuotations
                    .Where(q => q.OrderID == quotationId)
                    .FirstOrDefault();

                if (quotation == null)
                {
                    Console.WriteLine($"ConvertVendorQuotationToOrder: Quotation {quotationId} not found!");
                    return NotFound(new { error = "Vendor quotation not found" });
                }

                Console.WriteLine($"ConvertVendorQuotationToOrder: Found quotation - OrderID: {quotation.OrderID}, PONumber: {quotation.PONumber}, Status: {quotation.Status}, convertedOrderId: {quotation.convertedOrderId}");

                if (quotation == null)
                {
                    return NotFound(new { error = "Vendor quotation not found" });
                }

                // Get quotation details
                var quotationDetails = _context.VendorQuotationsDetails
                    .Where(d => d.OrderID == quotationId)
                    .OrderBy(d => d.ItemNo)
                    .ToList();

                // Create vendor order from quotation data
                var vendorOrder = new VendorOrder
                {
                    Tenantid = quotation.Tenantid,
                    VendorID = quotation.VendorID,
                    VendorCode = quotation.vendorcode ?? "",
                    VendorName = quotation.VendorName ?? "",
                    Address = quotation.address ?? "",
                    VendorPoNumber = quotation.VendorPoNumber ?? "",
                    OrderDate = DateTime.Now,
                    TotalAmount = quotation.TotalAmount,
                    UserId = requestData?.UserId ?? 0,
                    UserToken = requestData?.UserToken ?? 0,
                    Status = "Draft",
                    ShippingInstructions = quotation.shippingInstructions ?? "",
                    ExternalVendorPO = "",
                    BuyerName = "",
                    VendorRefNo = "",
                    OrderType = "Vendor",
                    MaterialType = "Material",
                    QuotationId = quotation.OrderID, // Store the quotation ID
                    QuotationNo = $"VQ#{quotation.PONumber}", // Store the quotation number
                    LocationId = quotation.locationid,
                    ParentQuotationID = quotation.ParentQuotationID,
                    AdditionalNotes = quotation.AdditionalNotes ?? ""
                };

                // Generate PO number for vendor order
                var maxOrder = _context.VendorOrders
                    .Where(o => o.Tenantid == quotation.Tenantid)
                    .OrderByDescending(o => o.PONumber)
                    .FirstOrDefault();

                vendorOrder.PONumber = (maxOrder?.PONumber ?? 0) + 1;

                _context.VendorOrders.Add(vendorOrder);
                _context.SaveChanges();

                Console.WriteLine($"ConvertVendorQuotationToOrder: Created vendor order {vendorOrder.OrderID} from quotation {quotationId}");

                // Create vendor order details from quotation details
                foreach (var quoteDetail in quotationDetails)
                {
                    var orderDetail = new VendorOrderDetail
                    {
                        OrderID = vendorOrder.OrderID,
                        Tenantid = quotation.Tenantid,
                        JobId = quoteDetail.JobId,
                        ItemNo = quoteDetail.ItemNo,
                        PartName = quoteDetail.itemname ?? "",
                        PartNo = quoteDetail.PartNo ?? "",
                        DueDate = quoteDetail.DueDate?.ToString("yyyy-MM-dd") ?? DateTime.Now.ToString("yyyy-MM-dd"),
                        DueDateDateTime = quoteDetail.DueDate ?? DateTime.Now,
                        JobNumber = quoteDetail.JobNumber ?? "",
                        JobDesc = quoteDetail.JobDesc ?? "",
                        QtyOrdered = quoteDetail.QtyOrdered,
                        Unit = quoteDetail.Unit ?? "EA",
                        UnitPrice = quoteDetail.UnitPrice,
                        JobPriority = quoteDetail.JobPriority,
                        Discount = quoteDetail.Discount,
                        DiscountType = string.IsNullOrWhiteSpace(quoteDetail.DiscountType) ? "Percent" : quoteDetail.DiscountType,
                        ProductId = quoteDetail.productid,
                        LeadTime = "",
                        Notes = quoteDetail.notes ?? "",
                        ShippedQty = 0,
                        ShippingStatus = "Not Started",
                        InvoicedQty = 0,
                        InvoiceStatus = "Not Invoiced",
                        glcode = quoteDetail.glcode ?? "",
                        Received = "No"
                    };

                    _context.VendorOrderDetails.Add(orderDetail);
                }

                _context.SaveChanges();

                // Update quotation status to "Converted"
                Console.WriteLine($"ConvertVendorQuotationToOrder: Before update - quotation.Status: '{quotation.Status}', convertedOrderId: {quotation.convertedOrderId}");
                quotation.Status = "Converted";
                quotation.convertedOrderId = vendorOrder.PONumber; // Store PONumber instead of OrderID for display consistency
                quotation.isconverted = 1;
                _context.SaveChanges();
                Console.WriteLine($"ConvertVendorQuotationToOrder: After update - quotation.Status: '{quotation.Status}', convertedOrderId: {vendorOrder.PONumber}");

                // Verify the update by re-querying
                var verifyQuotation = _context.VendorQuotations
                    .Where(q => q.OrderID == quotationId)
                    .FirstOrDefault();
                Console.WriteLine($"ConvertVendorQuotationToOrder: Verification - quotation.Status: '{verifyQuotation?.Status}', convertedOrderId: {verifyQuotation?.convertedOrderId}");

                return Ok(new
                {
                    result = new
                    {
                        id = vendorOrder.OrderID,
                        message = "Vendor quotation converted to order successfully",
                        quotationId = quotationId,
                        orderId = vendorOrder.OrderID
                    }
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"ConvertVendorQuotationToOrder: EXCEPTION - {ex.Message}");
                Console.WriteLine($"ConvertVendorQuotationToOrder: Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"ConvertVendorQuotationToOrder: Inner exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("DuplicateVendorQuotationForVendors")]
        public IActionResult DuplicateVendorQuotationForVendors([FromBody] JsonElement request)
        {
            try
            {
                if (request.ValueKind == JsonValueKind.Null || request.ValueKind == JsonValueKind.Undefined)
                {
                    return BadRequest(new { error = "Request is null" });
                }

                int sourceQuotationId = request.TryGetProperty("SourceQuotationId", out JsonElement sourceIdElem) ? sourceIdElem.GetInt32() : 0;
                int tenantid = request.TryGetProperty("Tenantid", out JsonElement tenantidElem) ? tenantidElem.GetInt32() : 0;
                
                if (sourceQuotationId <= 0 || tenantid <= 0)
                {
                    return BadRequest(new { error = "Source quotation ID and tenant ID are required" });
                }

                // Get source quotation
                var sourceQuotation = _context.VendorQuotations
                    .FirstOrDefault(q => q.OrderID == sourceQuotationId && q.Tenantid == tenantid);

                if (sourceQuotation == null)
                {
                    return NotFound(new { error = "Source quotation not found" });
                }

                // Get source details
                var sourceDetails = _context.VendorQuotationsDetails
                    .Where(d => d.OrderID == sourceQuotationId && d.Tenantid == tenantid)
                    .ToList();

                // Check if attachments should be included
                bool includeAttachments = request.TryGetProperty("IncludeAttachments", out JsonElement includeAttachmentsElem) 
                    && includeAttachmentsElem.ValueKind == JsonValueKind.True;

                // Get source quotation attachments if includeAttachments is true
                List<QuotationAttachmentDto> sourceAttachments = null;
                if (includeAttachments && !string.IsNullOrEmpty(sourceQuotation.AttachmentsJson))
                {
                    try
                    {
                        var options = new JsonSerializerOptions
                        {
                            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                            PropertyNameCaseInsensitive = true
                        };
                        sourceAttachments = JsonSerializer.Deserialize<List<QuotationAttachmentDto>>(
                            sourceQuotation.AttachmentsJson, options);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error deserializing source attachments: {ex.Message}");
                        sourceAttachments = null;
                    }
                }

                // Get vendor IDs from request
                if (!request.TryGetProperty("VendorIDs", out JsonElement vendorIdsElem) || vendorIdsElem.ValueKind != JsonValueKind.Array)
                {
                    return BadRequest(new { error = "VendorIDs array is required" });
                }

                var vendorIds = new List<int>();
                foreach (var vendorIdElem in vendorIdsElem.EnumerateArray())
                {
                    if (vendorIdElem.ValueKind == JsonValueKind.Number)
                    {
                        vendorIds.Add(vendorIdElem.GetInt32());
                    }
                }

                if (vendorIds.Count == 0)
                {
                    return BadRequest(new { error = "At least one vendor ID is required" });
                }

                // Use the source quotation ID as the parent ID for all related quotations
                int parentQuotationId = sourceQuotationId;

                // Get next PO Number
                var existingQuotations = _context.VendorQuotations
                    .Where(q => q.Tenantid == tenantid)
                    .ToList();

                int nextPONumber = existingQuotations.Any() 
                    ? Math.Max(1000, existingQuotations.Max(q => q.PONumber) + 1)
                    : 1000;

                var createdQuotationIds = new List<int>();

                // Handle each vendor - reset master vendor pricing, create new quotations for additional vendors
                foreach (var vendorId in vendorIds)
                {
                    if (sourceQuotation.VendorID == vendorId)
                    {
                        // This is the master vendor - reset their pricing to blank for competitive bidding
                        sourceQuotation.TotalAmount = 0;
                        sourceQuotation.Status = "Sent";
                        sourceQuotation.isSent = true;
                        sourceQuotation.sentDate = DateTime.Now;
                        // Ensure master quotation has ParentQuotationID set to itself for consistency
                        sourceQuotation.ParentQuotationID = sourceQuotationId;

                        // Copy attachments if includeAttachments is true
                        if (includeAttachments && sourceAttachments != null && sourceAttachments.Count > 0)
                        {
                            var attachmentOptions = new JsonSerializerOptions
                            {
                                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                                PropertyNameCaseInsensitive = true,
                                WriteIndented = false
                            };
                            sourceQuotation.AttachmentsJson = JsonSerializer.Serialize(sourceAttachments, attachmentOptions);
                        }

                        // Reset all line item pricing to blank
                        var masterDetails = _context.VendorQuotationsDetails
                            .Where(d => d.OrderID == sourceQuotationId && d.Tenantid == tenantid)
                            .ToList();

                        foreach (var detail in masterDetails)
                        {
                            detail.UnitPrice = 0;
                            detail.Discount = 0;
                        }

                        _context.SaveChanges();
                        createdQuotationIds.Add(sourceQuotationId);
                        continue;
                    }

                    // Additional vendor - create new quotation with blank pricing
                    var vendor = _context.VendorMaster
                        .FirstOrDefault(v => v.vendor_id == vendorId && v.Tenantid == tenantid);

                    if (vendor == null)
                    {
                        continue; // Skip invalid vendors
                    }

                    // Create new quotation (marked as response-only - won't appear in listing)
                    var newQuotation = new VendorQuotations
                    {
                        Tenantid = tenantid,
                        PONumber = nextPONumber++,
                        VendorID = vendorId,
                        vendorcode = vendor.vendorcode ?? "",
                        VendorName = vendor.company_name ?? "",
                        address = vendor.address ?? "",
                        VendorPoNumber = "",
                        OrderDate = sourceQuotation.OrderDate,
                        DueDate = sourceQuotation.DueDate,
                        TotalAmount = 0, // Start with 0 - vendors will provide actual pricing
                        UserId = sourceQuotation.UserId,
                        UserToken = sourceQuotation.UserToken,
                        Status = "Sent",
                        shippingInstructions = sourceQuotation.shippingInstructions ?? "",
                        contactName = sourceQuotation.contactName ?? "",
                        VendorOrderType = sourceQuotation.VendorOrderType ?? "Material",
                        ship_via = sourceQuotation.ship_via ?? "",
                        isSent = true,
                        sentDate = DateTime.Now,
                        ParentQuotationID = parentQuotationId,
                        locationid = sourceQuotation.locationid
                    };

                    // Mark as response-only so it doesn't appear in listing
                    newQuotation.IsResponseOnly = true;

                    // Copy attachments if includeAttachments is true
                    if (includeAttachments && sourceAttachments != null && sourceAttachments.Count > 0)
                    {
                        var attachmentOptions = new JsonSerializerOptions
                        {
                            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                            PropertyNameCaseInsensitive = true,
                            WriteIndented = false
                        };
                        newQuotation.AttachmentsJson = JsonSerializer.Serialize(sourceAttachments, attachmentOptions);
                    }

                    _context.VendorQuotations.Add(newQuotation);
                    _context.SaveChanges();

                    // Copy details
                    foreach (var sourceDetail in sourceDetails)
                    {
                        var newDetail = new VendorQuotationsDetails
                        {
                            OrderID = newQuotation.OrderID,
                            ItemNo = sourceDetail.ItemNo,
                            itemname = sourceDetail.itemname ?? "",
                            PartNo = sourceDetail.PartNo,
                            DueDate = sourceDetail.DueDate,
                            JobNumber = sourceDetail.JobNumber ?? "",
                            JobDesc = sourceDetail.JobDesc ?? "",
                            QtyOrdered = sourceDetail.QtyOrdered,
                            Unit = sourceDetail.Unit ?? "EA",
                            UnitPrice = 0, // Start with 0 - vendors enter actual pricing
                            JobPriority = sourceDetail.JobPriority,
                            Discount = 0, // Start with 0 - vendors enter actual discounts
                            DiscountType = "Percent",
                            Tenantid = tenantid,
                            productid = sourceDetail.productid,
                            notes = sourceDetail.notes,
                            glcode = sourceDetail.glcode ?? "",
                            JobId = sourceDetail.JobId,
                            Received = sourceDetail.Received ?? ""
                        };

                        _context.VendorQuotationsDetails.Add(newDetail);
                    }

                    _context.SaveChanges();
                    createdQuotationIds.Add(newQuotation.OrderID);
                }

                return Ok(new { result = new { quotationIds = createdQuotationIds, message = $"Created {createdQuotationIds.Count} quotation(s) for selected vendors" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetVendorQuotationComparison")]
        public IActionResult GetVendorQuotationComparison([FromQuery] int parentQuotationId, [FromQuery] int tenantId)
        {
            try
            {
                // First, find the actual parent quotation ID
                // If the provided parentQuotationId is a child quotation, get its parent
                // If it's already a master quotation, use it as is
                var initialQuotation = _context.VendorQuotations
                    .Where(q => q.OrderID == parentQuotationId && q.Tenantid == tenantId)
                    .FirstOrDefault();

                int actualParentId = parentQuotationId;
                if (initialQuotation != null && initialQuotation.ParentQuotationID.HasValue)
                {
                    // This is a child quotation, use its parent ID
                    actualParentId = initialQuotation.ParentQuotationID.Value;
                }

                // Get all quotations in the family:
                // 1. The master quotation (OrderID == actualParentId)
                // 2. All child quotations (ParentQuotationID == actualParentId)
                var masterQuotation = _context.VendorQuotations
                    .Where(q => q.OrderID == actualParentId && q.Tenantid == tenantId)
                    .FirstOrDefault();

                var quotations = _context.VendorQuotations
                    .Where(q => (q.ParentQuotationID == actualParentId || q.OrderID == actualParentId) && q.Tenantid == tenantId)
                    .ToList();

                // Materialize the quotation IDs to use in subsequent queries
                var existingQuotationIds = quotations.Select(q => q.OrderID).ToList();

                // If master quotation exists, also find related quotations by matching key attributes
                // This handles cases where ParentQuotationID might be null or incorrect
                if (masterQuotation != null)
                {
                    // Get master quotation's line items to match by part numbers and quantities
                    var masterDetails = _context.VendorQuotationsDetails
                        .Where(d => d.OrderID == actualParentId && d.Tenantid == tenantId)
                        .Select(d => new { d.PartNo, d.QtyOrdered })
                        .ToList();

                    // Find quotations that match by:
                    // 1. Same order date
                    // 2. Same quotation type
                    // 3. Not already in the quotations list
                    var candidateQuotations = _context.VendorQuotations
                        .Where(q => 
                            q.Tenantid == tenantId &&
                            q.OrderID != actualParentId &&
                            !existingQuotationIds.Contains(q.OrderID) &&
                            (q.OrderDate.HasValue && masterQuotation.OrderDate.HasValue && q.OrderDate.Value.Date == masterQuotation.OrderDate.Value.Date) &&
                            q.VendorOrderType == masterQuotation.VendorOrderType
                        )
                        .ToList();

                    // Filter candidates by matching line items
                    var relatedByAttributes = new List<VendorQuotations>();
                    foreach (var candidate in candidateQuotations)
                    {
                        var candidateDetails = _context.VendorQuotationsDetails
                            .Where(d => d.OrderID == candidate.OrderID && d.Tenantid == tenantId)
                            .Select(d => new { d.PartNo, d.QtyOrdered })
                            .ToList();

                        // Check if line items match (same part numbers and quantities)
                        if (candidateDetails.Count == masterDetails.Count &&
                            candidateDetails.All(cd => masterDetails.Any(md => 
                                md.PartNo == cd.PartNo && md.QtyOrdered == cd.QtyOrdered)))
                        {
                            relatedByAttributes.Add(candidate);
                        }
                    }

                    quotations.AddRange(relatedByAttributes);
                }

                var quotationsResult = quotations
                    .OrderBy(q => q.VendorName)
                    .Select(q => new
                    {
                        orderID = q.OrderID,
                        quotationNumber = q.PONumber,
                        vendorID = q.VendorID,
                        vendorCode = q.vendorcode ?? "",
                        vendorName = q.VendorName ?? "",
                        orderDate = q.OrderDate,
                        totalAmount = q.TotalAmount,
                        status = q.Status ?? "Draft",
                        isSent = q.isSent,
                        sentDate = q.sentDate,
                        isConverted = q.isconverted ?? 0,
                        convertedOrderId = q.convertedOrderId,
                        quotationType = q.VendorOrderType ?? "Material",
                        additionalNotes = q.AdditionalNotes ?? "",
                        parentQuotationID = q.ParentQuotationID
                    })
                    .ToList();

                if (quotationsResult.Count == 0)
                {
                    return NotFound(new { error = "No quotations found for comparison" });
                }

                // Get details for all quotations
                var quotationIds = quotationsResult.Select(q => q.orderID).ToList();
                var allDetails = _context.VendorQuotationsDetails
                    .Where(d => quotationIds.Contains(d.OrderID) && d.Tenantid == tenantId)
                    .OrderBy(d => d.OrderID)
                    .ThenBy(d => d.ItemNo)
                    .Select(d => new
                    {
                        orderID = d.OrderID,
                        itemNo = d.ItemNo,
                        partName = d.itemname ?? "",
                        partNo = d.PartNo ?? "",
                        qtyOrdered = d.QtyOrdered,
                        unit = d.Unit ?? "EA",
                        unitPrice = d.UnitPrice,
                        discount = d.Discount,
                        discountType = string.IsNullOrWhiteSpace(d.DiscountType) ? "Percent" : d.DiscountType,
                        dueDate = d.DueDate,
                        notes = d.notes ?? "",
                        glcode = d.glcode ?? "",
                        attachments = !string.IsNullOrEmpty(d.AttachmentsJson)
                            ? JsonSerializer.Deserialize<List<QuotationAttachmentDto>>(d.AttachmentsJson, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true })
                            : null
                    })
                    .ToList();

                // Log attachments for debugging
                foreach (var detail in allDetails)
                {
                    if (detail.attachments != null && detail.attachments.Count > 0)
                    {
                        Console.WriteLine($"Comparison: Loaded {detail.attachments.Count} attachments for detail ItemNo {detail.itemNo}, OrderID {detail.orderID}");
                    }
                }

                var result = new
                {
                    parentQuotationId = actualParentId,
                    quotations = quotationsResult,
                    details = allDetails
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Upload quotation attachments to Azure Blob Storage and create QuotationOrderAttachment records.
        /// Requires an existing quotation (orderId). Follows WorkflowAPI QuotationSaveFile storage pattern.
        /// </summary>
        [HttpPost("QuotationSaveFile")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> QuotationSaveFile(IFormCollection form)
        {
            try
            {
                var files = form.Files;
                if (files == null || files.Count == 0)
                {
                    return BadRequest(new { error = "At least one file is required" });
                }

                if (!form.ContainsKey("orderId") && !form.ContainsKey("OrderId") && !form.ContainsKey("formField"))
                {
                    return BadRequest(new { error = "orderId or formField is required" });
                }

                int orderId = 0;
                int tenantId = GetTenantId();
                int createdBy = GetUserId() ?? 0;

                if (form.ContainsKey("formField") && !string.IsNullOrWhiteSpace(form["formField"]))
                {
                    var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    var request = JsonSerializer.Deserialize<QuotationAttachmentUploadContext>(form["formField"]!, options);
                    if (request != null)
                    {
                        orderId = request.OrderId > 0 ? request.OrderId : request.OrderID;
                        if (request.TenantId > 0) tenantId = request.TenantId;
                        if (request.TenantID > 0) tenantId = request.TenantID;
                        if (request.Tenantid > 0) tenantId = request.Tenantid;
                    }
                }

                if (orderId <= 0)
                {
                    var orderIdValue = form.ContainsKey("orderId") ? form["orderId"].ToString()
                        : form.ContainsKey("OrderId") ? form["OrderId"].ToString() : "";
                    int.TryParse(orderIdValue, out orderId);
                }

                if (form.ContainsKey("tenantId") && int.TryParse(form["tenantId"], out var formTenant) && formTenant > 0)
                {
                    tenantId = formTenant;
                }

                if (orderId <= 0)
                {
                    return BadRequest(new { error = "A saved quotation (orderId) is required before uploading attachments" });
                }

                if (tenantId <= 0)
                {
                    return BadRequest(new { error = "TenantId is required" });
                }

                var quotation = _context.QuotationOrder
                    .FirstOrDefault(q => q.OrderID == orderId && q.Tenantid == tenantId);
                if (quotation == null)
                {
                    return NotFound(new { error = "Quotation not found" });
                }

                var uploaded = new List<QuotationAttachmentDto>();

                foreach (var file in files)
                {
                    if (file == null || file.Length <= 0)
                    {
                        continue;
                    }

                    var ext = Path.GetExtension(file.FileName)?.ToLowerInvariant() ?? "";
                    var displayName = Path.GetFileName(file.FileName);

                    int nextFileUniqueNo = 1;
                    if (_context.QuotationOrderAttachment.Any())
                    {
                        nextFileUniqueNo = _context.QuotationOrderAttachment.Max(x => x.FileUniqueno) + 1;
                    }

                    var blobName = $"{nextFileUniqueNo}{ext}";
                    var attachment = new QuotationOrderAttachment
                    {
                        orderid = orderId,
                        Name = displayName,
                        size = file.Length > int.MaxValue ? int.MaxValue : (int)file.Length,
                        FileUniqueno = nextFileUniqueNo,
                        UploadFile = blobName,
                        TenantID = tenantId,
                        FileCode = "",
                        Pageno = "0",
                        createdby = createdBy
                    };

                    _context.QuotationOrderAttachment.Add(attachment);
                    _context.SaveChanges();

                    var fileInfo = ModuleFileStorage.CreateFileInfo(
                        tenantId,
                        ModuleFileStorage.QuotationsFolder,
                        blobName,
                        createdBy);

                    var uploadedOk = await ModuleFileStorage.UploadAsync(_context, _configuration, file, fileInfo);
                    if (!uploadedOk)
                    {
                        _context.QuotationOrderAttachment.Remove(attachment);
                        _context.SaveChanges();
                        return StatusCode(500, new { error = $"Failed to upload file '{displayName}' to Azure Storage" });
                    }

                    uploaded.Add(MapAttachmentDto(attachment));
                }

                SyncQuotationAttachmentsJson(quotation);
                _context.SaveChanges();

                return Ok(new
                {
                    result = new
                    {
                        orderId,
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
        /// Returns quotation attachments with base64 FileCode loaded from Azure Blob Storage.
        /// </summary>
        [HttpGet("GetQuotationUploadFileWithFileCode")]
        public IActionResult GetQuotationUploadFileWithFileCode([FromQuery] int orderId, [FromQuery] int tenantId)
        {
            try
            {
                if (tenantId <= 0) tenantId = GetTenantId();
                if (orderId <= 0)
                {
                    return BadRequest(new { error = "orderId is required" });
                }

                var attachments = _context.QuotationOrderAttachment
                    .Where(a => a.orderid == orderId && a.TenantID == tenantId)
                    .OrderBy(a => a.Id)
                    .ToList();

                var result = new List<object>();
                foreach (var file in attachments)
                {
                    var fileInfo = ModuleFileStorage.CreateFileInfo(
                        tenantId,
                        ModuleFileStorage.QuotationsFolder,
                        file.UploadFile);

                    var bytes = ModuleFileStorage.DownloadBytes(_context, _configuration, fileInfo);
                    string? fileCode = null;
                    if (bytes != null && bytes.Length > 0)
                    {
                        fileCode = Convert.ToBase64String(bytes);
                    }

                    result.Add(new
                    {
                        id = file.Id,
                        orderid = file.orderid,
                        name = file.Name,
                        size = file.size,
                        fileUniqueno = file.FileUniqueno,
                        uploadFile = file.UploadFile,
                        tenantID = file.TenantID,
                        fileCode,
                        pageNo = file.Pageno ?? "0",
                        createdby = file.createdby,
                        contentType = ModuleFileStorage.GetContentType(file.Name ?? file.UploadFile)
                    });
                }

                return Ok(new { result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Single-file binary download for document viewing (inline Content-Disposition).
        /// One Azure blob read per request; no base64 encoding.
        /// </summary>
        [HttpGet("GetQuotationAttachmentFile")]
        public IActionResult GetQuotationAttachmentFile(
            [FromQuery] int orderId,
            [FromQuery] int fileUniqueno,
            [FromQuery] int tenantId = 0,
            [FromQuery] bool download = false)
        {
            try
            {
                if (orderId <= 0 || fileUniqueno <= 0)
                {
                    return BadRequest(new { error = "orderId and fileUniqueno are required" });
                }

                if (tenantId <= 0) tenantId = GetTenantId();

                var attachment = _context.QuotationOrderAttachment.FirstOrDefault(a =>
                    a.FileUniqueno == fileUniqueno &&
                    a.orderid == orderId &&
                    a.TenantID == tenantId);

                if (attachment == null)
                {
                    return NotFound(new { error = "Attachment not found" });
                }

                var fileInfo = ModuleFileStorage.CreateFileInfo(
                    tenantId,
                    ModuleFileStorage.QuotationsFolder,
                    attachment.UploadFile);

                var bytes = ModuleFileStorage.DownloadBytes(_context, _configuration, fileInfo);
                if (bytes == null || bytes.Length == 0)
                {
                    return NotFound(new { error = "File not found in Azure Storage" });
                }

                var contentType = ModuleFileStorage.GetContentType(attachment.Name ?? attachment.UploadFile);
                var fileName = ModuleFileStorage.SanitizeFileName(attachment.Name);

                if (download)
                {
                    return File(bytes, contentType, fileName);
                }

                // Inline for viewer consumption (blob response without forced download).
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

        [HttpPost("DownloadQuotationAttachment")]
        public IActionResult DownloadQuotationAttachment([FromBody] QuotationAttachmentDownloadRequest request)
        {
            try
            {
                if (request == null || request.OrderId <= 0)
                {
                    return BadRequest(new { error = "orderId is required" });
                }

                int tenantId = request.TenantId > 0 ? request.TenantId : GetTenantId();
                QuotationOrderAttachment? attachment = null;

                if (request.FileUniqueno > 0)
                {
                    attachment = _context.QuotationOrderAttachment.FirstOrDefault(a =>
                        a.FileUniqueno == request.FileUniqueno &&
                        a.orderid == request.OrderId &&
                        a.TenantID == tenantId);
                }
                else if (!string.IsNullOrEmpty(request.UploadFile))
                {
                    attachment = _context.QuotationOrderAttachment.FirstOrDefault(a =>
                        a.UploadFile == request.UploadFile &&
                        a.orderid == request.OrderId &&
                        a.TenantID == tenantId);
                }

                if (attachment == null)
                {
                    return NotFound(new { error = "Attachment not found" });
                }

                var fileInfo = ModuleFileStorage.CreateFileInfo(
                    tenantId,
                    ModuleFileStorage.QuotationsFolder,
                    attachment.UploadFile);

                var bytes = ModuleFileStorage.DownloadBytes(_context, _configuration, fileInfo);
                if (bytes == null || bytes.Length == 0)
                {
                    return NotFound(new { error = "File not found in Azure Storage" });
                }

                var downloadName = ModuleFileStorage.SanitizeFileName(
                    !string.IsNullOrWhiteSpace(request.Name) ? request.Name : attachment.Name);
                var contentType = ModuleFileStorage.GetContentType(attachment.Name ?? attachment.UploadFile);

                return File(bytes, contentType, downloadName);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("DeleteQuotationUploadedFile")]
        public async Task<IActionResult> DeleteQuotationUploadedFile([FromBody] QuotationAttachmentDeleteRequest request)
        {
            try
            {
                if (request == null || request.OrderId <= 0 || request.FileUniqueno <= 0)
                {
                    return BadRequest(new { error = "orderId and fileUniqueno are required" });
                }

                int tenantId = request.TenantId > 0 ? request.TenantId : GetTenantId();
                var attachment = _context.QuotationOrderAttachment.FirstOrDefault(a =>
                    a.FileUniqueno == request.FileUniqueno &&
                    a.orderid == request.OrderId &&
                    a.TenantID == tenantId);

                if (attachment == null)
                {
                    return NotFound(new { error = "Attachment not found" });
                }

                var fileInfo = ModuleFileStorage.CreateFileInfo(
                    tenantId,
                    ModuleFileStorage.QuotationsFolder,
                    attachment.UploadFile);

                await ModuleFileStorage.DeleteAsync(_context, _configuration, fileInfo);

                _context.QuotationOrderAttachment.Remove(attachment);
                _context.SaveChanges();

                var quotation = _context.QuotationOrder
                    .FirstOrDefault(q => q.OrderID == request.OrderId && q.Tenantid == tenantId);
                if (quotation != null)
                {
                    SyncQuotationAttachmentsJson(quotation);
                    _context.SaveChanges();
                }

                return Ok(new { result = new { message = "Attachment deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private async Task ProcessDeletedQuotationAttachments(
            int orderId,
            int tenantId,
            List<int> deletedAttachmentIds)
        {
            var uniqueIds = deletedAttachmentIds
                .Where(id => id > 0)
                .Distinct()
                .ToList();

            if (uniqueIds.Count == 0)
            {
                return;
            }

            var toDelete = _context.QuotationOrderAttachment
                .Where(a => a.orderid == orderId
                            && a.TenantID == tenantId
                            && uniqueIds.Contains(a.Id))
                .ToList();

            foreach (var attachment in toDelete)
            {
                if (!string.IsNullOrEmpty(attachment.UploadFile))
                {
                    var fileInfo = ModuleFileStorage.CreateFileInfo(
                        tenantId,
                        ModuleFileStorage.QuotationsFolder,
                        attachment.UploadFile);

                    await ModuleFileStorage.DeleteAsync(_context, _configuration, fileInfo);
                }
            }

            if (toDelete.Count > 0)
            {
                _context.QuotationOrderAttachment.RemoveRange(toDelete);
                _context.SaveChanges();
            }
        }

        /// <summary>
        /// Uploads only newly selected files. Never re-uploads existing Azure blobs.
        /// </summary>
        private async Task<string?> UploadNewQuotationAttachments(
            QuotationOrder quotation,
            List<IFormFile> newFiles,
            int createdBy)
        {
            foreach (var file in newFiles)
            {
                if (file == null || file.Length <= 0)
                {
                    continue;
                }

                var ext = Path.GetExtension(file.FileName)?.ToLowerInvariant() ?? "";
                var displayName = Path.GetFileName(file.FileName);

                int nextFileUniqueNo = 1;
                if (_context.QuotationOrderAttachment.Any())
                {
                    nextFileUniqueNo = _context.QuotationOrderAttachment.Max(x => x.FileUniqueno) + 1;
                }

                var blobName = $"{nextFileUniqueNo}{ext}";
                var attachment = new QuotationOrderAttachment
                {
                    orderid = quotation.OrderID,
                    Name = displayName,
                    size = file.Length > int.MaxValue ? int.MaxValue : (int)file.Length,
                    FileUniqueno = nextFileUniqueNo,
                    UploadFile = blobName,
                    TenantID = quotation.Tenantid,
                    FileCode = "",
                    Pageno = "0",
                    createdby = createdBy
                };

                _context.QuotationOrderAttachment.Add(attachment);
                _context.SaveChanges();

                var fileInfo = ModuleFileStorage.CreateFileInfo(
                    quotation.Tenantid,
                    ModuleFileStorage.QuotationsFolder,
                    blobName,
                    createdBy);

                var uploadedOk = await ModuleFileStorage.UploadAsync(_context, _configuration, file, fileInfo);
                if (!uploadedOk)
                {
                    _context.QuotationOrderAttachment.Remove(attachment);
                    _context.SaveChanges();
                    return $"Failed to upload file '{displayName}' to Azure Storage";
                }
            }

            return null;
        }

        private List<QuotationAttachmentDto> GetQuotationAttachmentDtos(int orderId, int tenantId, string? attachmentsJsonFallback)
        {
            var dbAttachments = _context.QuotationOrderAttachment
                .Where(a => a.orderid == orderId && a.TenantID == tenantId)
                .OrderBy(a => a.Id)
                .ToList();

            if (dbAttachments.Count > 0)
            {
                return dbAttachments.Select(MapAttachmentDto).ToList();
            }

            // Backward compatibility: metadata previously stored only in AttachmentsJson
            if (!string.IsNullOrEmpty(attachmentsJsonFallback))
            {
                try
                {
                    var options = new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                        PropertyNameCaseInsensitive = true
                    };
                    return JsonSerializer.Deserialize<List<QuotationAttachmentDto>>(attachmentsJsonFallback, options)
                           ?? new List<QuotationAttachmentDto>();
                }
                catch
                {
                    return new List<QuotationAttachmentDto>();
                }
            }

            return new List<QuotationAttachmentDto>();
        }

        private void SyncQuotationAttachmentsJson(QuotationOrder quotation)
        {
            var attachments = _context.QuotationOrderAttachment
                .Where(a => a.orderid == quotation.OrderID && a.TenantID == quotation.Tenantid)
                .OrderBy(a => a.Id)
                .Select(a => new QuotationAttachmentDto
                {
                    Id = a.Id,
                    Name = a.Name ?? "",
                    Size = a.size,
                    FileUrl = a.UploadFile ?? "",
                    FileUniqueno = a.FileUniqueno,
                    UploadFile = a.UploadFile ?? "",
                    PageNo = a.Pageno ?? "0",
                    CreatedBy = a.createdby
                })
                .ToList();

            if (attachments.Count == 0)
            {
                quotation.AttachmentsJson = null;
                return;
            }

            var attachmentOptions = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                PropertyNameCaseInsensitive = true,
                WriteIndented = false
            };
            quotation.AttachmentsJson = JsonSerializer.Serialize(attachments, attachmentOptions);
        }

        private static QuotationAttachmentDto MapAttachmentDto(QuotationOrderAttachment a)
        {
            return new QuotationAttachmentDto
            {
                Id = a.Id,
                Name = a.Name ?? "",
                Size = a.size,
                FileUrl = a.UploadFile ?? "",
                FileUniqueno = a.FileUniqueno,
                UploadFile = a.UploadFile ?? "",
                PageNo = a.Pageno ?? "0",
                CreatedBy = a.createdby
            };
        }
    }

    public class QuotationAttachmentUploadContext
    {
        public int OrderId { get; set; }
        public int OrderID { get; set; }
        public int TenantId { get; set; }
        public int TenantID { get; set; }
        public int Tenantid { get; set; }
    }

    public class QuotationReq
    {
        public int OrderID { get; set; }
        public int Tenantid { get; set; }
        public int CustomerID { get; set; }
        public string CustomerCode { get; set; } = "";
        public int PONumber { get; set; }
        public string CustomerName { get; set; } = "";
        public string Address { get; set; } = "";
        public string CustomerPoNumber { get; set; } = "";
        public DateTime OrderDate { get; set; }
        public decimal TotalAmount { get; set; }
        public int UserId { get; set; }
        public int UserToken { get; set; }
        public string Status { get; set; } = "Draft";
        public string ShippingInstructions { get; set; } = "";
        public string ExternalCustomerPO { get; set; } = "";
        public DateTime? ExternalOrderDate { get; set; }
        public string BuyerName { get; set; } = "";
        public string CustomerRefNo { get; set; } = "";
        public int? LocationId { get; set; }
        public List<QuotationDetailReq> Details { get; set; } = new List<QuotationDetailReq>();
        public List<QuotationAttachmentDto> Attachments { get; set; } = new List<QuotationAttachmentDto>();
        /// <summary>
        /// QuotationOrderAttachment.Id values removed in the UI and pending deletion on save.
        /// </summary>
        public List<int> DeletedAttachmentIds { get; set; } = new List<int>();
        public List<QuotationCommentDto> Comments { get; set; } = new List<QuotationCommentDto>();
    }

    public class QuotationAttachmentDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public int Size { get; set; }
        public string FileUrl { get; set; } = "";
        public int FileUniqueno { get; set; }
        public string UploadFile { get; set; } = "";
        public string PageNo { get; set; } = "0";
        public int CreatedBy { get; set; }
        public string? FileCode { get; set; }
    }

    public class QuotationAttachmentDeleteRequest
    {
        public int OrderId { get; set; }
        public int TenantId { get; set; }
        public int FileUniqueno { get; set; }
    }

    public class QuotationAttachmentDownloadRequest
    {
        public int OrderId { get; set; }
        public int TenantId { get; set; }
        public int FileUniqueno { get; set; }
        public string? Name { get; set; }
        public string? UploadFile { get; set; }
    }

    public class QuotationCommentDto
    {
        public int Id { get; set; }
        public string Text { get; set; } = "";
        public string CreatedAt { get; set; } = "";
        public string CreatedBy { get; set; } = "";
    }

    public class QuotationDetailReq
    {
        public int ID { get; set; }
        public int ItemNo { get; set; }
        public string PartName { get; set; } = "";
        public string PartNo { get; set; } = "";
        public DateTime DueDate { get; set; }
        public string JobNumber { get; set; } = "";
        public string JobDesc { get; set; } = "";
        public int QtyOrdered { get; set; }
        public string Unit { get; set; } = "";
        public decimal UnitPrice { get; set; }
        public int JobPriority { get; set; }
        public decimal Discount { get; set; }
        /// <summary>Percent (default) or Amount.</summary>
        public string DiscountType { get; set; } = "Percent";
        public int? ProductId { get; set; }
        public string LeadTime { get; set; } = "";
        public string Notes { get; set; } = "";
        public PriceBreakdownMatrixDto PriceBreakdownMatrix { get; set; }
    }

    public class PriceBreakdownMatrixDto
    {
        public List<int> Quantities { get; set; } = new List<int>(); // Simple quantity values for column headers
        public List<BreakdownPriceDto> BreakdownPrices { get; set; } = new List<BreakdownPriceDto>();
        /// <summary>One flag per quantity column. All default off.</summary>
        public List<bool> IncludeInPrint { get; set; } = new List<bool>();
    }

    public class BreakdownPriceDto
    {
        public int PriceBreakdownId { get; set; }
        public string ItemName { get; set; } = "";
        public List<decimal> Prices { get; set; } = new List<decimal>();
    }
}

