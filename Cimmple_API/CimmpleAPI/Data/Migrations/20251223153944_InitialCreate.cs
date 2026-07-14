using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BankCOAMapping",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    bankid = table.Column<int>(type: "int", nullable: false),
                    accountid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BankCOAMapping", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "BankMaster",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    BankName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AccountNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Balance = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    coa = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    locationId = table.Column<int>(type: "int", nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    RoutingNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AccountType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    accountname = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    displayname = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Bankcode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BankStreet1 = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BankStreet2 = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    abarounting = table.Column<int>(type: "int", nullable: true),
                    startingcheck = table.Column<int>(type: "int", nullable: true),
                    checkseries = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    street = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    city = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    state = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    zip = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    lastAccountNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    sharingid = table.Column<int>(type: "int", nullable: true),
                    NickName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ispayrollDefault = table.Column<bool>(type: "bit", nullable: true),
                    isprimary = table.Column<bool>(type: "bit", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BankMaster", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Category",
                columns: table => new
                {
                    categoryid = table.Column<int>(name: "category_id", type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    categoryname = table.Column<string>(name: "category_name", type: "nvarchar(max)", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Category", x => x.categoryid);
                });

            migrationBuilder.CreateTable(
                name: "ChartofAccounts",
                columns: table => new
                {
                    AccountID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AccountCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AccountName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AccountType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    Groupid = table.Column<int>(type: "int", nullable: true),
                    Subgroupid = table.Column<int>(type: "int", nullable: true),
                    Subgroupid2 = table.Column<int>(type: "int", nullable: true),
                    Subgroupid3 = table.Column<int>(type: "int", nullable: true),
                    Linegroupid = table.Column<int>(type: "int", nullable: true),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    MainGroup = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChartofAccounts", x => x.AccountID);
                });

            migrationBuilder.CreateTable(
                name: "COARowtitle",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SubGroupID = table.Column<int>(type: "int", nullable: false),
                    name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_COARowtitle", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "Comments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    EntryType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UniqueNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Comments = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    CreatedBy = table.Column<int>(type: "int", nullable: false),
                    CreatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedFor = table.Column<int>(type: "int", nullable: false),
                    MailSent = table.Column<bool>(type: "bit", nullable: false),
                    Readed = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Comments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CustomerBillingAddress",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    customerid = table.Column<int>(name: "customer_id", type: "int", nullable: false),
                    billingaddressline1 = table.Column<string>(name: "billing_address_line1", type: "nvarchar(max)", nullable: false),
                    billingaddressline2 = table.Column<string>(name: "billing_address_line2", type: "nvarchar(max)", nullable: false),
                    billingcity = table.Column<string>(name: "billing_city", type: "nvarchar(max)", nullable: false),
                    billingstate = table.Column<string>(name: "billing_state", type: "nvarchar(max)", nullable: false),
                    billingcountry = table.Column<string>(name: "billing_country", type: "nvarchar(max)", nullable: false),
                    billingpostalcode = table.Column<string>(name: "billing_postal_code", type: "nvarchar(max)", nullable: false),
                    IsDefault = table.Column<int>(type: "int", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerBillingAddress", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "CustomerContact",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    customerid = table.Column<int>(name: "customer_id", type: "int", nullable: false),
                    title = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    firstname = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    lastname = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    phoneno = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    email = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    isDefault = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerContact", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "CustomerMaster",
                columns: table => new
                {
                    customerid = table.Column<int>(name: "customer_id", type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    companyname = table.Column<string>(name: "company_name", type: "nvarchar(max)", nullable: false),
                    companyAlias = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    firstname = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    lastname = table.Column<string>(name: "last_name", type: "nvarchar(max)", nullable: false),
                    email = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    address = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    apartment = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    country = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    city = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    state = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    zip = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    phonenumber = table.Column<string>(name: "phone_number", type: "nvarchar(max)", nullable: false),
                    registrationdate = table.Column<DateTime>(name: "registration_date", type: "datetime2", nullable: true),
                    lastlogindate = table.Column<DateTime>(name: "last_login_date", type: "datetime2", nullable: true),
                    Pointofcontact = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ContactEmail = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    WebAddress = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    customercode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingAddress = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingCity = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingStates = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingCountry = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingZipCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingApartment = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    status = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerMaster", x => x.customerid);
                });

            migrationBuilder.CreateTable(
                name: "CustomerOrder",
                columns: table => new
                {
                    OrderID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CustomerID = table.Column<int>(type: "int", nullable: false),
                    customercode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PONumber = table.Column<int>(type: "int", nullable: false),
                    CustomerName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    address = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CustomerPoNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OrderDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    TotalAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    UserToken = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    locationId = table.Column<int>(type: "int", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    quotationId = table.Column<int>(type: "int", nullable: true),
                    shippingInstructions = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ExternalCustomerPO = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    QuotationNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ExternalOrderDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    BuyerName = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerOrder", x => x.OrderID);
                });

            migrationBuilder.CreateTable(
                name: "CustomerOrderDetails",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    OrderID = table.Column<int>(type: "int", nullable: false),
                    ItemNo = table.Column<int>(type: "int", nullable: false),
                    partname = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PartNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DueDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    JobNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    JobDesc = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    QtyOrdered = table.Column<int>(type: "int", nullable: false),
                    Unit = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    JobPriority = table.Column<int>(type: "int", nullable: false),
                    Discount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    productid = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerOrderDetails", x => x.ID);
                });

            migrationBuilder.CreateTable(
                name: "CustomerShippingAddressNew",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    customerid = table.Column<int>(name: "customer_id", type: "int", nullable: false),
                    shippingAddress = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingCity = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingStates = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingCountry = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingZipCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingApartment = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IsDefault = table.Column<int>(type: "int", nullable: false),
                    firstname = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerShippingAddressNew", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "Deposits",
                columns: table => new
                {
                    DepositID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TransactionID = table.Column<int>(type: "int", nullable: false),
                    splitLocationid = table.Column<int>(type: "int", nullable: true),
                    AccountID = table.Column<int>(type: "int", nullable: false),
                    DepositDetails = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    InternalNotes = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TenantID = table.Column<int>(type: "int", nullable: false),
                    adjustmentId = table.Column<int>(type: "int", nullable: true),
                    banksyncId = table.Column<int>(type: "int", nullable: true),
                    ReconcileCL = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Deposits", x => x.DepositID);
                });

            migrationBuilder.CreateTable(
                name: "DocumentMaster",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    DocumentName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DocumentType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    CreatedBy = table.Column<int>(type: "int", nullable: false),
                    CreatedDate = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentMaster", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DocumentType",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TypeName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentType", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EntityMaster",
                columns: table => new
                {
                    entityid = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    companyname = table.Column<string>(name: "company_name", type: "nvarchar(max)", nullable: false),
                    firstname = table.Column<string>(name: "first_name", type: "nvarchar(max)", nullable: false),
                    lastname = table.Column<string>(name: "last_name", type: "nvarchar(max)", nullable: false),
                    email = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    phonenumber = table.Column<string>(name: "phone_number", type: "nvarchar(max)", nullable: false),
                    registrationdate = table.Column<DateTime>(name: "registration_date", type: "datetime2", nullable: true),
                    lastlogindate = table.Column<DateTime>(name: "last_login_date", type: "datetime2", nullable: true),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    pointofcontact = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ContactEmail = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    WebAddress = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    address = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    apartment = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    country = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    entitycode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    city = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    state = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    zip = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SaleTax = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    QuotationPrefix = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CustomerPrefix = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    VendorPrefix = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ShippingPrefix = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    InvoicePrefix = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    timezoneui = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    timezone = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    coacount = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityMaster", x => x.entityid);
                });

            migrationBuilder.CreateTable(
                name: "Inventory",
                columns: table => new
                {
                    productid = table.Column<int>(name: "product_id", type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    productname = table.Column<string>(name: "product_name", type: "nvarchar(max)", nullable: false),
                    categoryid = table.Column<int>(name: "category_id", type: "int", nullable: false),
                    producttypeint = table.Column<int>(name: "producttype_int", type: "int", nullable: false),
                    quantityinstock = table.Column<int>(name: "quantity_in_stock", type: "int", nullable: false),
                    price = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    sizeid = table.Column<int>(type: "int", nullable: false),
                    inventorydescription = table.Column<string>(name: "inventory_description", type: "nvarchar(max)", nullable: false),
                    status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Inventory", x => x.productid);
                });

            migrationBuilder.CreateTable(
                name: "InvoiceDetail",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    InvoiceId = table.Column<int>(type: "int", nullable: false),
                    OrderId = table.Column<int>(type: "int", nullable: false),
                    ProductId = table.Column<int>(type: "int", nullable: true),
                    OrderDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CustomerPoNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    price = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    discount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    qty = table.Column<int>(type: "int", nullable: false),
                    ReconcileCL = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoiceDetail", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "InvoiceMaster",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    InvoiceNo = table.Column<int>(type: "int", nullable: false),
                    PrefixInvoiceNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    InvoiceDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DueDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    AccountingPeriod = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ShippingCharge = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    OtherCharge = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    SaleTax = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    SaleTaxAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    InternalNotes = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CheckNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PaymentMethod = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PaymentDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Bankid = table.Column<int>(type: "int", nullable: true),
                    createdby = table.Column<int>(type: "int", nullable: true),
                    createdDate = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoiceMaster", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "JobAttachment",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    jobid = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    size = table.Column<int>(type: "int", nullable: false),
                    FileUniqueno = table.Column<int>(type: "int", nullable: false),
                    UploadFile = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TenantID = table.Column<int>(type: "int", nullable: false),
                    FileCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Pageno = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    createdby = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JobAttachment", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "jobDetails",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    jobid = table.Column<int>(type: "int", nullable: false),
                    ProcessOrder = table.Column<int>(type: "int", nullable: false),
                    processid = table.Column<int>(type: "int", nullable: false),
                    processname = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    type = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    jdescription = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    assignedid = table.Column<int>(type: "int", nullable: true),
                    workstationid = table.Column<int>(type: "int", nullable: true),
                    qty = table.Column<int>(type: "int", nullable: true),
                    tenantid = table.Column<int>(type: "int", nullable: false),
                    AssignedComment = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_jobDetails", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "jobdetailstatus",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    jobdetailid = table.Column<int>(type: "int", nullable: false),
                    assigntoid = table.Column<int>(type: "int", nullable: false),
                    startdate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    enddate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    status = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_jobdetailstatus", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "jobMaster",
                columns: table => new
                {
                    jobid = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    orderid = table.Column<int>(type: "int", nullable: false),
                    jobNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    partid = table.Column<int>(type: "int", nullable: false),
                    createdby = table.Column<int>(type: "int", nullable: false),
                    tenantid = table.Column<int>(type: "int", nullable: false),
                    jobassignedId = table.Column<int>(type: "int", nullable: false),
                    processid = table.Column<int>(type: "int", nullable: true),
                    ReworkCount = table.Column<int>(type: "int", nullable: true),
                    TrackerStatus = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DrawingNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DrawingRevision = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ManualTracking = table.Column<bool>(type: "bit", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_jobMaster", x => x.jobid);
                });

            migrationBuilder.CreateTable(
                name: "JobNCR",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    RCA = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PlannedAction = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    locationId = table.Column<int>(type: "int", nullable: false),
                    JobId = table.Column<int>(type: "int", nullable: true),
                    TypeOfNCR = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    NCRCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    NCRNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedBy = table.Column<int>(type: "int", nullable: true),
                    CreatedOn = table.Column<DateTime>(type: "datetime2", nullable: true),
                    InvestigatedBy = table.Column<int>(type: "int", nullable: true),
                    InvestigatedOn = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DispositionBy = table.Column<int>(type: "int", nullable: true),
                    DispositionOn = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReportedOn = table.Column<DateTime>(type: "datetime2", nullable: true),
                    vendorOrderId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JobNCR", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "JobTracker",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    jobid = table.Column<int>(type: "int", nullable: false),
                    processid = table.Column<int>(type: "int", nullable: false),
                    assignedid = table.Column<int>(type: "int", nullable: false),
                    startdate = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    holdtime = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    enddatetime = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    tenantid = table.Column<int>(type: "int", nullable: false),
                    status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Explanation = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    qtyComment = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    JobNCRId = table.Column<int>(type: "int", nullable: true),
                    completeqty = table.Column<int>(type: "int", nullable: true),
                    qty = table.Column<int>(type: "int", nullable: true),
                    NCRQty = table.Column<int>(type: "int", nullable: true),
                    userid = table.Column<int>(type: "int", nullable: true),
                    IsCreatedFromNCR = table.Column<bool>(type: "bit", nullable: true),
                    isNCR = table.Column<bool>(type: "bit", nullable: true),
                    jobdetailsid = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JobTracker", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "JournalEntries",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    EntryDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ReferenceNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AccountingPeriod = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    locationId = table.Column<int>(type: "int", nullable: false),
                    createdby = table.Column<int>(type: "int", nullable: true),
                    createdDate = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JournalEntries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "JournalEntryFrom",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    JournalEntryId = table.Column<int>(type: "int", nullable: false),
                    AccountId = table.Column<int>(type: "int", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JournalEntryFrom", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "JournalEntryTo",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    JournalEntryId = table.Column<int>(type: "int", nullable: false),
                    AccountId = table.Column<int>(type: "int", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JournalEntryTo", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Locations",
                columns: table => new
                {
                    LocationId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Address = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Region = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    city = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    state = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    zip = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    email = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    webaddress = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    phone = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Country = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    LocType = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Locations", x => x.LocationId);
                });

            migrationBuilder.CreateTable(
                name: "LogoAttachment",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    locationId = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    size = table.Column<int>(type: "int", nullable: false),
                    FileUniqueno = table.Column<int>(type: "int", nullable: false),
                    UploadFile = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TenantID = table.Column<int>(type: "int", nullable: false),
                    FileCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Pageno = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    createdby = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LogoAttachment", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MainGroup",
                columns: table => new
                {
                    Autoid = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    MainGroupID = table.Column<int>(type: "int", nullable: false),
                    MainGroupName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    accountId = table.Column<int>(type: "int", nullable: false),
                    tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MainGroup", x => x.Autoid);
                });

            migrationBuilder.CreateTable(
                name: "NCRCodeMaster",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    NCRCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedBy = table.Column<int>(type: "int", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    CreatedDate = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NCRCodeMaster", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "OrderAttachment",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    orderid = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    size = table.Column<int>(type: "int", nullable: false),
                    FileUniqueno = table.Column<int>(type: "int", nullable: false),
                    UploadFile = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TenantID = table.Column<int>(type: "int", nullable: false),
                    FileCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Pageno = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    createdby = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderAttachment", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PartBreakupSetup",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    priceid = table.Column<int>(type: "int", nullable: false),
                    qty1 = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    qty2 = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    qty3 = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    qty4 = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    qty5 = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    partId = table.Column<int>(type: "int", nullable: false),
                    tenantId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PartBreakupSetup", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "Payment",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    series = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ckno = table.Column<int>(type: "int", nullable: false),
                    ckdate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    memo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    tenantid = table.Column<int>(type: "int", nullable: false),
                    vid = table.Column<int>(type: "int", nullable: false),
                    isPrint = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    createdby = table.Column<int>(type: "int", nullable: false),
                    bankid = table.Column<int>(type: "int", nullable: false),
                    createdate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Uniqueno = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Payment", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PermissionMaster",
                columns: table => new
                {
                    PermissionId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PermissionName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DisplayPermissionName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    LevelInfo = table.Column<int>(type: "int", nullable: false),
                    OrderNo = table.Column<int>(type: "int", nullable: true),
                    Url = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ReportGroup = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    reportid = table.Column<int>(type: "int", nullable: true),
                    ReportDescription = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PermissionMaster", x => x.PermissionId);
                });

            migrationBuilder.CreateTable(
                name: "PermissionRole",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RoleId = table.Column<int>(type: "int", nullable: false),
                    PermissionId = table.Column<int>(type: "int", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PermissionRole", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ProcessMaster",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ProcessName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Srno = table.Column<int>(type: "int", nullable: false),
                    PDescription = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    isFixed = table.Column<int>(type: "int", nullable: true),
                    status = table.Column<int>(type: "int", nullable: false),
                    ledgercode = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProcessMaster", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ProductMaster",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    partno = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    partname = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    tenantid = table.Column<int>(type: "int", nullable: false),
                    Unit = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Noofday = table.Column<int>(type: "int", nullable: true),
                    pdescription = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    customerid = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductMaster", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ProductType",
                columns: table => new
                {
                    producttypeint = table.Column<int>(name: "producttype_int", type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    producttypename = table.Column<string>(name: "producttype_name", type: "nvarchar(max)", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductType", x => x.producttypeint);
                });

            migrationBuilder.CreateTable(
                name: "QuotationOrder",
                columns: table => new
                {
                    OrderID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CustomerID = table.Column<int>(type: "int", nullable: false),
                    customercode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PONumber = table.Column<int>(type: "int", nullable: false),
                    CustomerName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    address = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CustomerPoNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OrderDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    TotalAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    UserToken = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    shippingInstructions = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ExternalCustomerPO = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ExternalOrderDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    BuyerName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CustomerRefNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    isConverted = table.Column<int>(type: "int", nullable: true),
                    Locationid = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuotationOrder", x => x.OrderID);
                });

            migrationBuilder.CreateTable(
                name: "QuotationOrderAttachment",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    orderid = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    size = table.Column<int>(type: "int", nullable: false),
                    FileUniqueno = table.Column<int>(type: "int", nullable: false),
                    UploadFile = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TenantID = table.Column<int>(type: "int", nullable: false),
                    FileCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Pageno = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    createdby = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuotationOrderAttachment", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "QuotationOrderDetails",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    OrderID = table.Column<int>(type: "int", nullable: false),
                    ItemNo = table.Column<int>(type: "int", nullable: false),
                    partname = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PartNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DueDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    JobNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    JobDesc = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    QtyOrdered = table.Column<int>(type: "int", nullable: false),
                    Unit = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    JobPriority = table.Column<int>(type: "int", nullable: false),
                    Discount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    productid = table.Column<int>(type: "int", nullable: true),
                    leadTime = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    isConverted = table.Column<int>(type: "int", nullable: true),
                    convertedorderid = table.Column<int>(type: "int", nullable: true),
                    notes = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuotationOrderDetails", x => x.ID);
                });

            migrationBuilder.CreateTable(
                name: "Shipping",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ShipmentNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ShipViaId = table.Column<int>(type: "int", nullable: true),
                    ShipVia = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CourierTrackingNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TotalBoxNo = table.Column<int>(type: "int", nullable: true),
                    PackingType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Terms = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ShipmentDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    OrderId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Shipping", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ShippingDetails",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ShippedQty = table.Column<int>(type: "int", nullable: false),
                    JobId = table.Column<int>(type: "int", nullable: false),
                    ShipmentId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShippingDetails", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SubGroup",
                columns: table => new
                {
                    Autoid = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SubGroupID = table.Column<int>(type: "int", nullable: false),
                    MainGroupID = table.Column<int>(type: "int", nullable: true),
                    SubGroupName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubGroup", x => x.Autoid);
                });

            migrationBuilder.CreateTable(
                name: "SubGroup2",
                columns: table => new
                {
                    Autoid = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SubGroup2ID = table.Column<int>(type: "int", nullable: false),
                    SubGroupID = table.Column<int>(type: "int", nullable: true),
                    SubGroup2Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubGroup2", x => x.Autoid);
                });

            migrationBuilder.CreateTable(
                name: "SubGroup3",
                columns: table => new
                {
                    SubGroup3ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SubGroup2ID = table.Column<int>(type: "int", nullable: true),
                    SubGroup3Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubGroup3", x => x.SubGroup3ID);
                });

            migrationBuilder.CreateTable(
                name: "Transactions",
                columns: table => new
                {
                    TransactionID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TransactionType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PaymentMethod = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    TransactionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    dueDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    invoiceDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    invoiceNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AccountingPeriod = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CheckNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: true),
                    locationId = table.Column<int>(type: "int", nullable: false),
                    BankId = table.Column<int>(type: "int", nullable: true),
                    vendorid = table.Column<int>(type: "int", nullable: true),
                    contractid = table.Column<int>(type: "int", nullable: true),
                    approved = table.Column<bool>(type: "bit", nullable: true),
                    isCustomer = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Transactions", x => x.TransactionID);
                });

            migrationBuilder.CreateTable(
                name: "TransCoa",
                columns: table => new
                {
                    Uniqueno = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    Transid = table.Column<int>(type: "int", nullable: false),
                    accountid = table.Column<int>(type: "int", nullable: false),
                    Transname = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TransCoa", x => x.Uniqueno);
                });

            migrationBuilder.CreateTable(
                name: "TransferEntries",
                columns: table => new
                {
                    TransferID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TransferDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    SourceAccountID = table.Column<int>(type: "int", nullable: false),
                    accountidfrom = table.Column<int>(type: "int", nullable: false),
                    accountidto = table.Column<int>(type: "int", nullable: false),
                    ReferenceNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TenantID = table.Column<int>(type: "int", nullable: false),
                    locationId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TransferEntries", x => x.TransferID);
                });

            migrationBuilder.CreateTable(
                name: "UserDetails",
                columns: table => new
                {
                    UserUniqueID = table.Column<int>(name: "User_UniqueID", type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FirstName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    LastName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TenantID = table.Column<int>(type: "int", nullable: false),
                    UserName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Password = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Role = table.Column<int>(type: "int", nullable: true),
                    PwdResetDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Phone1 = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EmployeeType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Dateofhire = table.Column<string>(name: "Date_of_hire", type: "nvarchar(max)", nullable: false),
                    UserToken = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PasswordSalt = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PwdChangeStatus = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ChangePassword = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    HID = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PrimaryContact = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Dateoftermination = table.Column<string>(name: "Date_of_termination", type: "nvarchar(max)", nullable: false),
                    TerminationReason = table.Column<string>(name: "Termination_Reason", type: "nvarchar(max)", nullable: false),
                    ValidateStatus = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DOB = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SSN = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ChangedBy = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreateDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsSalesAgent = table.Column<int>(type: "int", nullable: true),
                    AllowPTO = table.Column<int>(type: "int", nullable: true),
                    AllowPerformance = table.Column<int>(type: "int", nullable: true),
                    AllowACATracking = table.Column<int>(type: "int", nullable: true),
                    AllowDeposit = table.Column<int>(type: "int", nullable: true),
                    BlockedPhone = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SendWelcomeEmail = table.Column<int>(type: "int", nullable: true),
                    PwdType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PhoneUpdateStatus = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Address = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Phone2 = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    City = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    State = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Zip = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Street = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PrimaryMethod = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    VendorId = table.Column<int>(type: "int", nullable: true),
                    ContractId = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PaidByVendor = table.Column<int>(type: "int", nullable: true),
                    AllowContactorOverTime = table.Column<int>(type: "int", nullable: true),
                    SearchSSN = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EmpCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Empid = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserDetails", x => x.UserUniqueID);
                });

            migrationBuilder.CreateTable(
                name: "UserInfo",
                columns: table => new
                {
                    UserID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserUniqueID = table.Column<int>(name: "User_UniqueID", type: "int", nullable: false),
                    LogInTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LogInStatus = table.Column<int>(type: "int", nullable: false),
                    IPAddress = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserInfo", x => x.UserID);
                });

            migrationBuilder.CreateTable(
                name: "UserLogin",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    username = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    logintime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ipaddress = table.Column<int>(type: "int", nullable: false),
                    browser = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserLogin", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "UserMapping",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    userId = table.Column<int>(type: "int", nullable: false),
                    locationId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserMapping", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserRole",
                columns: table => new
                {
                    RoleID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RoleName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OrderNo = table.Column<int>(type: "int", nullable: false),
                    ResetPwd = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    RoleTag = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserRole", x => x.RoleID);
                });

            migrationBuilder.CreateTable(
                name: "UserWorkstationMapping",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    WorkstationId = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserWorkstationMapping", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "VendorBillingAddress",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    customerid = table.Column<int>(name: "customer_id", type: "int", nullable: false),
                    billingaddressline1 = table.Column<string>(name: "billing_address_line1", type: "nvarchar(max)", nullable: false),
                    billingaddressline2 = table.Column<string>(name: "billing_address_line2", type: "nvarchar(max)", nullable: false),
                    billingcity = table.Column<string>(name: "billing_city", type: "nvarchar(max)", nullable: false),
                    billingstate = table.Column<string>(name: "billing_state", type: "nvarchar(max)", nullable: false),
                    billingcountry = table.Column<string>(name: "billing_country", type: "nvarchar(max)", nullable: false),
                    billingpostalcode = table.Column<string>(name: "billing_postal_code", type: "nvarchar(max)", nullable: false),
                    IsDefault = table.Column<int>(type: "int", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorBillingAddress", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "VendorCOAMapping",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    vendorid = table.Column<int>(type: "int", nullable: false),
                    accountid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorCOAMapping", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "VendorContact",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    customerid = table.Column<int>(name: "customer_id", type: "int", nullable: false),
                    title = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    firstname = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    lastname = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    phoneno = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    email = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    isDefault = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorContact", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "VendorInvoiceDetail",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    InvoiceId = table.Column<int>(type: "int", nullable: false),
                    accountid = table.Column<int>(type: "int", nullable: true),
                    vdetailid = table.Column<int>(type: "int", nullable: true),
                    OrderId = table.Column<int>(type: "int", nullable: false),
                    splitLocationid = table.Column<int>(type: "int", nullable: true),
                    OrderDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    VendorPoNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    ReconcileCL = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    adjustmentId = table.Column<int>(type: "int", nullable: true),
                    banksyncId = table.Column<int>(type: "int", nullable: true),
                    qty = table.Column<int>(type: "int", nullable: true),
                    price = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    qtyordered = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorInvoiceDetail", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "VendorInvoiceMaster",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    locationId = table.Column<int>(type: "int", nullable: false),
                    InvoiceNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PaymentMethod = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    InvoiceDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DueDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    VendorCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    VendorName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AccountingPeriod = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TotalAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Approved = table.Column<bool>(type: "bit", nullable: true),
                    CkNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CkDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    PvrNo = table.Column<int>(type: "int", nullable: true),
                    Series = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    iscustomer = table.Column<bool>(type: "bit", nullable: true),
                    entrytype = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    vid = table.Column<int>(type: "int", nullable: false),
                    Adj = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    isPaid = table.Column<int>(type: "int", nullable: true),
                    Paydate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Bankid = table.Column<int>(type: "int", nullable: true),
                    createdby = table.Column<int>(type: "int", nullable: true),
                    voidedby = table.Column<int>(type: "int", nullable: true),
                    entrydate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    voideddate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    prefixinvoiceno = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorInvoiceMaster", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "VendorMaster",
                columns: table => new
                {
                    vendorid = table.Column<int>(name: "vendor_id", type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    companyname = table.Column<string>(name: "company_name", type: "nvarchar(max)", nullable: false),
                    companyAlias = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    firstname = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    lastname = table.Column<string>(name: "last_name", type: "nvarchar(max)", nullable: false),
                    email = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    address = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    apartment = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    country = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    phonenumber = table.Column<string>(name: "phone_number", type: "nvarchar(max)", nullable: false),
                    registrationdate = table.Column<DateTime>(name: "registration_date", type: "datetime2", nullable: true),
                    lastlogindate = table.Column<DateTime>(name: "last_login_date", type: "datetime2", nullable: true),
                    Pointofcontact = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ContactEmail = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    WebAddress = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    shipvia = table.Column<string>(name: "ship_via", type: "nvarchar(max)", nullable: false),
                    term = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    purchasingagent = table.Column<string>(name: "purchasing_agent", type: "nvarchar(max)", nullable: false),
                    city = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    state = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    zip = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    vendorcode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingAddress = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingCity = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingStates = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingCountry = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingZipCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingApartment = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorMaster", x => x.vendorid);
                });

            migrationBuilder.CreateTable(
                name: "VendorOrder",
                columns: table => new
                {
                    OrderID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    VendorID = table.Column<int>(type: "int", nullable: false),
                    shipvia = table.Column<string>(name: "ship_via", type: "nvarchar(max)", nullable: false),
                    refNo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    vendorcode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PONumber = table.Column<int>(type: "int", nullable: false),
                    VendorName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    address = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    VendorPoNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OrderDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DueDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    sentDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    cancelDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    TotalAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    UserToken = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    locationId = table.Column<int>(type: "int", nullable: false),
                    shippingInstructions = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    contactName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    VendorOrderType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    POInitiated = table.Column<bool>(type: "bit", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorOrder", x => x.OrderID);
                });

            migrationBuilder.CreateTable(
                name: "VendorOrderDetails",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    JobId = table.Column<int>(type: "int", nullable: false),
                    OrderID = table.Column<int>(type: "int", nullable: false),
                    ItemNo = table.Column<int>(type: "int", nullable: false),
                    itemname = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    glcode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DueDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    JobNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    JobDesc = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    QtyOrdered = table.Column<int>(type: "int", nullable: false),
                    Unit = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    JobPriority = table.Column<int>(type: "int", nullable: false),
                    Discount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    Received = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    productid = table.Column<int>(type: "int", nullable: true),
                    partid = table.Column<int>(type: "int", nullable: true),
                    ReceivedQty = table.Column<int>(type: "int", nullable: true),
                    IsAdditionItem = table.Column<bool>(type: "bit", nullable: true),
                    Groupid = table.Column<int>(type: "int", nullable: true),
                    jobdetailId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorOrderDetails", x => x.ID);
                });

            migrationBuilder.CreateTable(
                name: "VendorQuotations",
                columns: table => new
                {
                    OrderID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    VendorID = table.Column<int>(type: "int", nullable: false),
                    shipvia = table.Column<string>(name: "ship_via", type: "nvarchar(max)", nullable: false),
                    vendorcode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PONumber = table.Column<int>(type: "int", nullable: false),
                    VendorName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    address = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    VendorPoNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OrderDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DueDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    TotalAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    UserToken = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    shippingInstructions = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    contactName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    VendorOrderType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    POInitiated = table.Column<bool>(type: "bit", nullable: true),
                    isSent = table.Column<bool>(type: "bit", nullable: false),
                    sentDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    isconverted = table.Column<int>(type: "int", nullable: true),
                    locationid = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorQuotations", x => x.OrderID);
                });

            migrationBuilder.CreateTable(
                name: "VendorQuotationsDetails",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    JobId = table.Column<int>(type: "int", nullable: false),
                    OrderID = table.Column<int>(type: "int", nullable: false),
                    ItemNo = table.Column<int>(type: "int", nullable: false),
                    itemname = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    glcode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DueDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    JobNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    JobDesc = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    QtyOrdered = table.Column<int>(type: "int", nullable: false),
                    Unit = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    JobPriority = table.Column<int>(type: "int", nullable: false),
                    Discount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    Received = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    productid = table.Column<int>(type: "int", nullable: true),
                    ReceivedQty = table.Column<int>(type: "int", nullable: true),
                    IsAdditionItem = table.Column<bool>(type: "bit", nullable: true),
                    Groupid = table.Column<int>(type: "int", nullable: true),
                    jobdetailId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorQuotationsDetails", x => x.ID);
                });

            migrationBuilder.CreateTable(
                name: "VendorRFQDetails",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RFQID = table.Column<int>(type: "int", nullable: false),
                    vid = table.Column<int>(type: "int", nullable: true),
                    vgroupid = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorRFQDetails", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "VendorRFQitems",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    rfqdetailid = table.Column<int>(type: "int", nullable: true),
                    qty = table.Column<int>(type: "int", nullable: true),
                    itemid = table.Column<int>(type: "int", nullable: true),
                    price = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    notes = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorRFQitems", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "VendorRFQMaster",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    orderid = table.Column<int>(type: "int", nullable: false),
                    StartDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    enddate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    status = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorRFQMaster", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "VendorShippingAddress",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    customerid = table.Column<int>(name: "customer_id", type: "int", nullable: false),
                    shippingAddress = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingCity = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingStates = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingCountry = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingZipCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingApartment = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IsDefault = table.Column<int>(type: "int", nullable: false),
                    firstname = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorShippingAddress", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "Withdrawals",
                columns: table => new
                {
                    WithdrawalID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TransactionID = table.Column<int>(type: "int", nullable: false),
                    splitLocationid = table.Column<int>(type: "int", nullable: true),
                    AccountID = table.Column<int>(type: "int", nullable: false),
                    WithdrawalDetails = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    InternalNotes = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    TenantID = table.Column<int>(type: "int", nullable: false),
                    adjustmentId = table.Column<int>(type: "int", nullable: true),
                    banksyncId = table.Column<int>(type: "int", nullable: true),
                    ReconcileCL = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Withdrawals", x => x.WithdrawalID);
                });

            migrationBuilder.CreateTable(
                name: "WorkstationMaster",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    WorkstationName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkstationMaster", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BankCOAMapping");

            migrationBuilder.DropTable(
                name: "BankMaster");

            migrationBuilder.DropTable(
                name: "Category");

            migrationBuilder.DropTable(
                name: "ChartofAccounts");

            migrationBuilder.DropTable(
                name: "COARowtitle");

            migrationBuilder.DropTable(
                name: "Comments");

            migrationBuilder.DropTable(
                name: "CustomerBillingAddress");

            migrationBuilder.DropTable(
                name: "CustomerContact");

            migrationBuilder.DropTable(
                name: "CustomerMaster");

            migrationBuilder.DropTable(
                name: "CustomerOrder");

            migrationBuilder.DropTable(
                name: "CustomerOrderDetails");

            migrationBuilder.DropTable(
                name: "CustomerShippingAddressNew");

            migrationBuilder.DropTable(
                name: "Deposits");

            migrationBuilder.DropTable(
                name: "DocumentMaster");

            migrationBuilder.DropTable(
                name: "DocumentType");

            migrationBuilder.DropTable(
                name: "EntityMaster");

            migrationBuilder.DropTable(
                name: "Inventory");

            migrationBuilder.DropTable(
                name: "InvoiceDetail");

            migrationBuilder.DropTable(
                name: "InvoiceMaster");

            migrationBuilder.DropTable(
                name: "JobAttachment");

            migrationBuilder.DropTable(
                name: "jobDetails");

            migrationBuilder.DropTable(
                name: "jobdetailstatus");

            migrationBuilder.DropTable(
                name: "jobMaster");

            migrationBuilder.DropTable(
                name: "JobNCR");

            migrationBuilder.DropTable(
                name: "JobTracker");

            migrationBuilder.DropTable(
                name: "JournalEntries");

            migrationBuilder.DropTable(
                name: "JournalEntryFrom");

            migrationBuilder.DropTable(
                name: "JournalEntryTo");

            migrationBuilder.DropTable(
                name: "Locations");

            migrationBuilder.DropTable(
                name: "LogoAttachment");

            migrationBuilder.DropTable(
                name: "MainGroup");

            migrationBuilder.DropTable(
                name: "NCRCodeMaster");

            migrationBuilder.DropTable(
                name: "OrderAttachment");

            migrationBuilder.DropTable(
                name: "PartBreakupSetup");

            migrationBuilder.DropTable(
                name: "Payment");

            migrationBuilder.DropTable(
                name: "PermissionMaster");

            migrationBuilder.DropTable(
                name: "PermissionRole");

            migrationBuilder.DropTable(
                name: "ProcessMaster");

            migrationBuilder.DropTable(
                name: "ProductMaster");

            migrationBuilder.DropTable(
                name: "ProductType");

            migrationBuilder.DropTable(
                name: "QuotationOrder");

            migrationBuilder.DropTable(
                name: "QuotationOrderAttachment");

            migrationBuilder.DropTable(
                name: "QuotationOrderDetails");

            migrationBuilder.DropTable(
                name: "Shipping");

            migrationBuilder.DropTable(
                name: "ShippingDetails");

            migrationBuilder.DropTable(
                name: "SubGroup");

            migrationBuilder.DropTable(
                name: "SubGroup2");

            migrationBuilder.DropTable(
                name: "SubGroup3");

            migrationBuilder.DropTable(
                name: "Transactions");

            migrationBuilder.DropTable(
                name: "TransCoa");

            migrationBuilder.DropTable(
                name: "TransferEntries");

            migrationBuilder.DropTable(
                name: "UserDetails");

            migrationBuilder.DropTable(
                name: "UserInfo");

            migrationBuilder.DropTable(
                name: "UserLogin");

            migrationBuilder.DropTable(
                name: "UserMapping");

            migrationBuilder.DropTable(
                name: "UserRole");

            migrationBuilder.DropTable(
                name: "UserWorkstationMapping");

            migrationBuilder.DropTable(
                name: "VendorBillingAddress");

            migrationBuilder.DropTable(
                name: "VendorCOAMapping");

            migrationBuilder.DropTable(
                name: "VendorContact");

            migrationBuilder.DropTable(
                name: "VendorInvoiceDetail");

            migrationBuilder.DropTable(
                name: "VendorInvoiceMaster");

            migrationBuilder.DropTable(
                name: "VendorMaster");

            migrationBuilder.DropTable(
                name: "VendorOrder");

            migrationBuilder.DropTable(
                name: "VendorOrderDetails");

            migrationBuilder.DropTable(
                name: "VendorQuotations");

            migrationBuilder.DropTable(
                name: "VendorQuotationsDetails");

            migrationBuilder.DropTable(
                name: "VendorRFQDetails");

            migrationBuilder.DropTable(
                name: "VendorRFQitems");

            migrationBuilder.DropTable(
                name: "VendorRFQMaster");

            migrationBuilder.DropTable(
                name: "VendorShippingAddress");

            migrationBuilder.DropTable(
                name: "Withdrawals");

            migrationBuilder.DropTable(
                name: "WorkstationMaster");
        }
    }
}
