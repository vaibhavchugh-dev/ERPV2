using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Data
{
    public class CimmpleDbContext : DbContext
    {
        public CimmpleDbContext(DbContextOptions<CimmpleDbContext> options) : base(options) { }

        // Master Entities
        public DbSet<CustomerMaster> CustomerMaster { get; set; }
        public DbSet<CustomerContact> CustomerContact { get; set; }
        public DbSet<CustomerBillingAddress> CustomerBillingAddress { get; set; }
        public DbSet<CustomerShippingAddressNew> CustomerShippingAddressNew { get; set; }

        // Vendor master (mirrors Customer master structure)
        public DbSet<VendorMaster> VendorMaster { get; set; }
        public DbSet<VendorContact> VendorContact { get; set; }
        public DbSet<VendorCOAMapping> VendorCOAMapping { get; set; }

        public DbSet<ProductMaster> ProductMaster { get; set; }
        public DbSet<PartBreakupSetup> PartBreakupSetup { get; set; }
        public DbSet<RawMaterialMaster> RawMaterialMaster { get; set; }

        public DbSet<BankMaster> BankMaster { get; set; }
        public DbSet<BankCOAMapping> BankCOAMapping { get; set; }

        public DbSet<ChartofAccounts> ChartofAccounts { get; set; }
        public DbSet<MainGroup> MainGroup { get; set; }
        public DbSet<SubGroup> SubGroup { get; set; }
        public DbSet<SubGroup2> SubGroup2 { get; set; }
        public DbSet<SubGroup3> SubGroup3 { get; set; }
        public DbSet<COARowtitle> COARowtitle { get; set; }

        public DbSet<Location> Locations { get; set; }
        public DbSet<LogoAttachment> LogoAttachment { get; set; }

        public DbSet<WorkstationMaster> WorkstationMaster { get; set; }
        public DbSet<UserWorkstationMapping> UserWorkstationMapping { get; set; }
        public DbSet<gcwConfig> gcwConfig { get; set; }

        public DbSet<NCRCodeMaster> NCRCodeMaster { get; set; }
        public DbSet<NonConformanceReport> NonConformanceReports { get; set; }
        public DbSet<ProcessMaster> ProcessMaster { get; set; }
        public DbSet<PriceBreakdownMaster> PriceBreakdownMaster { get; set; }
        public DbSet<CreditCardMaster> CreditCardMaster { get; set; }
        public DbSet<DocumentMaster> DocumentMaster { get; set; }
        public DbSet<DocumentType> DocumentType { get; set; }
        public DbSet<EntityMaster> EntityMaster { get; set; }
        
        // Document Management Entities
        public DbSet<Document> Documents { get; set; }
        public DbSet<DocumentVersion> DocumentVersions { get; set; }
        public DbSet<DocumentFile> DocumentFiles { get; set; }
        public DbSet<DocumentCategory> DocumentCategories { get; set; }
        public DbSet<DocumentAccessLog> DocumentAccessLogs { get; set; }

        // Order Entities
        public DbSet<CustomerOrder> CustomerOrder { get; set; }
        public DbSet<CustomerOrderDetails> CustomerOrderDetails { get; set; }
        public DbSet<OrderAttachment> OrderAttachment { get; set; }

        public DbSet<QuotationOrder> QuotationOrder { get; set; }
        public DbSet<QuotationOrderDetails> QuotationOrderDetails { get; set; }
        public DbSet<QuotationOrderAttachment> QuotationOrderAttachment { get; set; }

        // Job Order Entities
        public DbSet<JobOrderMaster> JobOrderMaster { get; set; }

        public DbSet<VendorOrder> VendorOrders { get; set; }
        public DbSet<VendorOrderDetail> VendorOrderDetails { get; set; }
        public DbSet<VendorOrderAttachment> VendorOrderAttachments { get; set; }
        public DbSet<VendorOrderComment> VendorOrderComments { get; set; }
        public DbSet<VendorReceiving> VendorReceiving { get; set; }
        public DbSet<VendorQuotations> VendorQuotations { get; set; }
        public DbSet<VendorQuotationsDetails> VendorQuotationsDetails { get; set; }

        // Commented out missing vendor RFQ entities to fix compilation errors
        // public DbSet<VendorRFQMaster> VendorRFQMaster { get; set; }
        // public DbSet<VendorRFQDetails> VendorRFQDetails { get; set; }
        // public DbSet<VendorRFQitems> VendorRFQitems { get; set; }

        // Job Entities
        public DbSet<jobMaster> jobMaster { get; set; }
        public DbSet<jobdetails> jobDetails { get; set; }
        public DbSet<jobdetailstatus> jobdetailstatus { get; set; }
        public DbSet<JobTracker> JobTracker { get; set; }
        public DbSet<JobNCR> JobNCR { get; set; }
        public DbSet<JobAttachment> JobAttachment { get; set; }

        // Invoice Entities
        public DbSet<InvoiceMaster> InvoiceMaster { get; set; }
        public DbSet<InvoiceDetail> InvoiceDetail { get; set; }
        public DbSet<VendorInvoiceMaster> VendorInvoiceMaster { get; set; }
        public DbSet<VendorInvoiceDetail> VendorInvoiceDetail { get; set; }
        public DbSet<VendorInvoicing> VendorInvoicing { get; set; }
        public DbSet<Payment> Payment { get; set; }

        // User Entities
        public DbSet<UserDetail> UserDetails { get; set; }
        public DbSet<UserRole> UserRole { get; set; }
        public DbSet<UserInfo> UserInfo { get; set; }
        public DbSet<UserLogin> UserLogin { get; set; }
        public DbSet<UserMapping> UserMapping { get; set; }
        public DbSet<PunchBoardDto> PunchBoardDto { get; set; }
        public DbSet<PermissionMaster> PermissionMaster { get; set; }
        public DbSet<PermissionRole> PermissionRole { get; set; }
        public DbSet<SystemSettings> SystemSettings { get; set; }

        // Supporting Entities
        public DbSet<Comment> Comments { get; set; }
        public DbSet<Shipping> Shipping { get; set; }
        public DbSet<ShippingDetails> ShippingDetails { get; set; }
        public DbSet<Inventory> Inventory { get; set; }
        public DbSet<Category> Category { get; set; }
        public DbSet<ProductType> ProductType { get; set; }
        public DbSet<InventoryBalance> InventoryBalance { get; set; }
        public DbSet<InventoryTransaction> InventoryTransaction { get; set; }
        public DbSet<InventoryTransactionType> InventoryTransactionType { get; set; }
        public DbSet<InventoryLot> InventoryLot { get; set; }
        public DbSet<InventoryLotBalance> InventoryLotBalance { get; set; }

        // Transaction Entities
        public DbSet<Transactions> Transactions { get; set; }
        public DbSet<Deposits> Deposits { get; set; }
        public DbSet<Withdrawals> Withdrawals { get; set; }
        public DbSet<Transfer> TransferEntries { get; set; }
        public DbSet<JournalEntry> JournalEntries { get; set; }
        public DbSet<JournalDetailsFrom> JournalEntryFrom { get; set; }
        public DbSet<JournalDetailsTo> JournalEntryTo { get; set; }
        public DbSet<TransCoa> TransCoa { get; set; }
        public DbSet<GlAccountingPeriodLock> GlAccountingPeriodLocks { get; set; }
        public DbSet<GlAuditEvent> GlAuditEvents { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            
            // Configure PriceBreakdownMaster table name
            modelBuilder.Entity<PriceBreakdownMaster>()
                .ToTable("PriceBreakdownMaster");
            
            // Configure CreditCardMaster table name
            modelBuilder.Entity<CreditCardMaster>(entity =>
            {
                entity.ToTable("CreditCardMaster");
                // Ignore COA property since the column doesn't exist in the database
                entity.Ignore(e => e.COA);
            });
            
            // Configure model relationships and constraints here

            // =============================================
            // VENDOR ORDER CONFIGURATIONS
            // =============================================

            modelBuilder.Entity<VendorOrder>(entity =>
            {
                entity.ToTable("VendorOrders");
                entity.HasKey(e => e.OrderID);
                entity.Property(e => e.MaterialType).HasDefaultValue("Material");
                entity.Property(e => e.OrderType).HasDefaultValue("Vendor");
                // Explicitly configure all string properties to be nullable to handle existing NULL values in database
                entity.Property(e => e.VendorCode).IsRequired(false);
                entity.Property(e => e.VendorName).IsRequired(false);
                entity.Property(e => e.Address).IsRequired(false);
                entity.Property(e => e.VendorPoNumber).IsRequired(false);
                entity.Property(e => e.Status).IsRequired(false);
                entity.Property(e => e.ShippingInstructions).IsRequired(false);
                entity.Property(e => e.ExternalVendorPO).IsRequired(false);
                entity.Property(e => e.BuyerName).IsRequired(false);
                entity.Property(e => e.VendorRefNo).IsRequired(false);
                entity.Property(e => e.OrderType).IsRequired(false);
                entity.Property(e => e.MaterialType).IsRequired(false);
                entity.Property(e => e.QuotationNo).IsRequired(false);
                entity.Property(e => e.AdditionalNotes).IsRequired(false);
            });

            modelBuilder.Entity<VendorOrderDetail>(entity =>
            {
                entity.ToTable("VendorOrderDetails");
                entity.HasKey(e => e.ID);
                // Required fields - must have values
                entity.Property(e => e.JobId).IsRequired();
                entity.Property(e => e.Tenantid).IsRequired();
                entity.Property(e => e.glcode).IsRequired();
                entity.Property(e => e.Received).IsRequired();
                // Map PartName to itemname (required column)
                entity.Property(e => e.PartName).HasColumnName("itemname").IsRequired();
                // Map DueDate property to DueDateString column (if exists)
                entity.Property(e => e.DueDate).HasColumnName("DueDateString").IsRequired(false);
                // Map DueDateDateTime to DueDate (required DateTime column)
                entity.Property(e => e.DueDateDateTime).HasColumnName("DueDate").IsRequired();
                // Required string columns (NOT NULL in database)
                entity.Property(e => e.JobNumber).IsRequired();
                entity.Property(e => e.JobDesc).IsRequired();
                entity.Property(e => e.Unit).IsRequired();
                // Explicitly configure other string properties to be nullable to handle existing NULL values in database
                entity.Property(e => e.PartNo).IsRequired(false);
                entity.Property(e => e.LeadTime).IsRequired(false);
                entity.Property(e => e.Notes).IsRequired(false);
                entity.Property(e => e.ShippingStatus).IsRequired(false);
                entity.Property(e => e.InvoiceStatus).IsRequired(false);
                // Map ProductId to productid column
                entity.Property(e => e.ProductId).HasColumnName("productid");
                entity.HasOne(d => d.VendorOrder)
                    .WithMany(o => o.VendorOrderDetails)
                    .HasForeignKey(d => d.OrderID);
            });

            modelBuilder.Entity<VendorOrderAttachment>(entity =>
            {
                entity.ToTable("VendorOrderAttachments");
                entity.HasKey(e => e.Id);
                // Explicitly configure all string properties to be nullable to handle existing NULL values in database
                entity.Property(e => e.Name).IsRequired(false);
                entity.Property(e => e.FileUrl).IsRequired(false);
                entity.HasOne(a => a.VendorOrder)
                    .WithMany(o => o.VendorOrderAttachments)
                    .HasForeignKey(a => a.OrderID);
            });

            modelBuilder.Entity<VendorOrderComment>(entity =>
            {
                entity.ToTable("VendorOrderComments");
                entity.HasKey(e => e.Id);
                // Explicitly configure all string properties to be nullable to handle existing NULL values in database
                entity.Property(e => e.Text).IsRequired(false);
                entity.Property(e => e.CreatedBy).IsRequired(false);
                entity.HasOne(c => c.VendorOrder)
                    .WithMany(o => o.VendorOrderComments)
                    .HasForeignKey(c => c.OrderID);
            });

            modelBuilder.Entity<VendorReceiving>(entity =>
            {
                entity.ToTable("VendorReceiving");
                entity.HasKey(e => e.ID);
                entity.Property(e => e.VendorOrderDetailID).IsRequired();
                entity.Property(e => e.ReceivedQty).IsRequired();
                entity.Property(e => e.ReceivedDate).IsRequired();
                entity.Property(e => e.ReceivedBy).IsRequired();
                entity.Property(e => e.Tenantid).IsRequired();
                entity.Property(e => e.Notes).IsRequired(false);
                entity.HasOne(r => r.VendorOrderDetail)
                    .WithMany(d => d.VendorReceivings)
                    .HasForeignKey(r => r.VendorOrderDetailID);
            });

            modelBuilder.Entity<VendorInvoicing>(entity =>
            {
                entity.ToTable("VendorInvoicing");
                entity.HasKey(e => e.ID);
                entity.Property(e => e.VendorInvoiceDetailID).IsRequired();
                entity.Property(e => e.VendorOrderDetailID).IsRequired();
                entity.Property(e => e.InvoicedQty).IsRequired();
                entity.Property(e => e.InvoicedDate).IsRequired();
                entity.Property(e => e.InvoicedBy).IsRequired();
                entity.Property(e => e.Tenantid).IsRequired();
                entity.Property(e => e.Notes).IsRequired(false);
                entity.HasOne(i => i.VendorOrderDetail)
                    .WithMany(d => d.VendorInvoicings)
                    .HasForeignKey(i => i.VendorOrderDetailID)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            // =============================================
            // VENDOR QUOTATIONS CONFIGURATIONS
            // =============================================

            modelBuilder.Entity<VendorQuotations>(entity =>
            {
                entity.ToTable("VendorQuotations");
                entity.HasKey(e => e.OrderID);
                // Explicitly configure all string properties to be nullable to handle existing NULL values in database
                entity.Property(e => e.Status).IsRequired(false);
                entity.Property(e => e.VendorName).IsRequired(false);
                entity.Property(e => e.VendorOrderType).IsRequired(false);
                entity.Property(e => e.VendorPoNumber).IsRequired(false);
                entity.Property(e => e.address).IsRequired(false);
                entity.Property(e => e.contactName).IsRequired(false);
                entity.Property(e => e.ship_via).IsRequired(false);
                entity.Property(e => e.shippingInstructions).IsRequired(false);
                entity.Property(e => e.vendorcode).IsRequired(false);
                entity.Property(e => e.AdditionalNotes).IsRequired(false);
                entity.Property(e => e.AttachmentsJson).IsRequired(false);
                entity.Property(e => e.CommentsJson).IsRequired(false);
            });

            modelBuilder.Entity<VendorQuotationsDetails>(entity =>
            {
                entity.ToTable("VendorQuotationsDetails");
                entity.HasKey(e => e.ID);
                // Explicitly configure all string properties to be nullable to handle existing NULL values in database
                entity.Property(e => e.JobDesc).IsRequired(false);
                entity.Property(e => e.JobNumber).IsRequired(false);
                entity.Property(e => e.Received).IsRequired(false);
                entity.Property(e => e.Unit).IsRequired(false);
                entity.Property(e => e.glcode).IsRequired(false);
                entity.Property(e => e.itemname).IsRequired(false);
                entity.Property(e => e.PartNo).IsRequired(false);
                entity.Property(e => e.notes).IsRequired(false);
                entity.Property(e => e.AttachmentsJson).IsRequired(false);
                entity.HasOne(d => d.VendorQuotation)
                    .WithMany(o => o.VendorQuotationsDetails)
                    .HasForeignKey(d => d.OrderID);
            });

            // =============================================
            // DOCUMENT MANAGEMENT CONFIGURATIONS
            // =============================================

            modelBuilder.Entity<Document>(entity =>
            {
                entity.ToTable("Documents");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.TenantId, e.IsDeleted, e.IsActive });
                entity.HasIndex(e => new { e.RelatedEntityType, e.RelatedEntityId });
                entity.HasOne(d => d.Category)
                    .WithMany(c => c.Documents)
                    .HasForeignKey(d => d.CategoryId)
                    .OnDelete(DeleteBehavior.SetNull);
                entity.HasOne(d => d.CurrentVersion)
                    .WithMany()
                    .HasForeignKey(d => d.CurrentVersionId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<DocumentVersion>(entity =>
            {
                entity.ToTable("DocumentVersions");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.DocumentId, e.VersionNumber }).IsUnique();
                entity.HasIndex(e => e.TenantId);
                entity.HasOne(v => v.Document)
                    .WithMany(d => d.Versions)
                    .HasForeignKey(v => v.DocumentId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<DocumentFile>(entity =>
            {
                entity.ToTable("DocumentFiles");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.TenantId);
                entity.HasOne(f => f.Document)
                    .WithMany(d => d.Files)
                    .HasForeignKey(f => f.DocumentId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<DocumentCategory>(entity =>
            {
                entity.ToTable("DocumentCategories");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.CategoryName, e.TenantId }).IsUnique();
            });

            modelBuilder.Entity<DocumentAccessLog>(entity =>
            {
                entity.ToTable("DocumentAccessLog");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.DocumentId, e.ActionDate });
                entity.HasIndex(e => e.TenantId);
                entity.HasOne(l => l.Document)
                    .WithMany()
                    .HasForeignKey(l => l.DocumentId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(l => l.Version)
                    .WithMany()
                    .HasForeignKey(l => l.VersionId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            // =============================================
            // INVENTORY MODULE CONFIGURATIONS
            // =============================================

            modelBuilder.Entity<Location>(entity =>
            {
                entity.ToTable("Locations");
                entity.HasKey(e => e.LocationId);
                entity.HasIndex(e => new { e.TenantId, e.ParentLocationId });
                entity.HasOne(e => e.Parent)
                    .WithMany(e => e.Children)
                    .HasForeignKey(e => e.ParentLocationId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<RawMaterialMaster>(entity =>
            {
                entity.ToTable("RawMaterialMaster");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.Tenantid, e.PartNo });
                entity.Property(e => e.IsActive).HasDefaultValue(true);
                entity.HasOne(e => e.ParentRawMaterial)
                    .WithMany()
                    .HasForeignKey(e => e.ParentRawMaterialId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.DefaultLocation)
                    .WithMany()
                    .HasForeignKey(e => e.DefaultLocationId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<InventoryBalance>(entity =>
            {
                entity.ToTable("InventoryBalance");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.ProductId, e.LocationId, e.Tenantid }).HasFilter("[ProductId] IS NOT NULL");
                entity.HasIndex(e => new { e.RawMaterialId, e.LocationId, e.Tenantid }).HasFilter("[RawMaterialId] IS NOT NULL");
                entity.HasIndex(e => e.Tenantid);
                entity.HasOne(e => e.Product)
                    .WithMany()
                    .HasForeignKey(e => e.ProductId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.RawMaterial)
                    .WithMany()
                    .HasForeignKey(e => e.RawMaterialId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.Location)
                    .WithMany()
                    .HasForeignKey(e => e.LocationId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<InventoryTransactionType>(entity =>
            {
                entity.ToTable("InventoryTransactionType");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.Code).IsUnique();
            });

            modelBuilder.Entity<InventoryTransaction>(entity =>
            {
                entity.ToTable("InventoryTransaction");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.ProductId, e.LocationId, e.TransactionDate });
                entity.HasIndex(e => new { e.RawMaterialId, e.LocationId, e.TransactionDate });
                entity.HasIndex(e => e.Tenantid);
                entity.HasOne(e => e.Product)
                    .WithMany()
                    .HasForeignKey(e => e.ProductId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.RawMaterial)
                    .WithMany()
                    .HasForeignKey(e => e.RawMaterialId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.Location)
                    .WithMany()
                    .HasForeignKey(e => e.LocationId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.TransactionType)
                    .WithMany()
                    .HasForeignKey(e => e.TransactionTypeId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.Lot)
                    .WithMany()
                    .HasForeignKey(e => e.LotId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<InventoryLot>(entity =>
            {
                entity.ToTable("InventoryLot");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.LotNumber, e.Tenantid });
                entity.HasOne(e => e.Product)
                    .WithMany()
                    .HasForeignKey(e => e.ProductId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.RawMaterial)
                    .WithMany()
                    .HasForeignKey(e => e.RawMaterialId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<InventoryLotBalance>(entity =>
            {
                entity.ToTable("InventoryLotBalance");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.LotId, e.LocationId, e.Tenantid }).IsUnique();
                entity.HasOne(e => e.Lot)
                    .WithMany()
                    .HasForeignKey(e => e.LotId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Location)
                    .WithMany()
                    .HasForeignKey(e => e.LocationId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<GlAccountingPeriodLock>(entity =>
            {
                entity.ToTable("GlAccountingPeriodLocks");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.TenantId, e.PeriodKey }).IsUnique();
            });

            modelBuilder.Entity<GlAuditEvent>(entity =>
            {
                entity.ToTable("GlAuditEvents");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.TenantId, e.OccurredUtc });
            });

            // Seed default transaction types
            modelBuilder.Entity<InventoryTransactionType>().HasData(
                new InventoryTransactionType { Id = 1, Code = "RECEIPT", Name = "Receipt", IsPositive = true },
                new InventoryTransactionType { Id = 2, Code = "ISSUE", Name = "Issue", IsPositive = false },
                new InventoryTransactionType { Id = 3, Code = "TRANSFER_IN", Name = "Transfer In", IsPositive = true },
                new InventoryTransactionType { Id = 4, Code = "TRANSFER_OUT", Name = "Transfer Out", IsPositive = false },
                new InventoryTransactionType { Id = 5, Code = "ADJUSTMENT", Name = "Adjustment", IsPositive = true }
            );
        }
    }
}
