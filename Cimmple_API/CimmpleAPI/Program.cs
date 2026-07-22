using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Text;
using System.Text.Json;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Repositories;
using CimmpleAPI.Services;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// For local development, ensure the API listens on a predictable URL.
// This overrides launchSettings when running via 'dotnet run'.
builder.WebHost.UseUrls("http://localhost:5172");

// Configure Serilog
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .CreateLogger();

builder.Host.UseSerilog();

// Add services to the container
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });

// Disable automatic 400 responses from model validation so we can control
// validation logic in controllers (prevents issues with unused fields like
// pointofcontact / purchasing_agent).
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.SuppressModelStateInvalidFilter = true;
});

// Configure CORS
builder.Services.AddCors(c =>
{
    c.AddPolicy("_CorsPolicy", options =>
    {
        options
            .AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

// Configure Entity Framework
builder.Services.AddDbContext<CimmpleDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DB")));

// Register PDF Service
builder.Services.AddScoped<CimmpleAPI.Services.Pdf.PdfService>();

// Register Document Storage Service
builder.Services.AddScoped<CimmpleAPI.Services.DocumentStorageService>();

// Register Inventory Service
builder.Services.AddScoped<CimmpleAPI.Services.InventoryService>();

// Register User Repository
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IUserRepository, UserRepository>();

// Configure JWT Authentication
var tokenConfig = builder.Configuration.GetSection("TokenConfig");
var key = Encoding.ASCII.GetBytes(tokenConfig["Key"] ?? "DefaultKey");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(cfg =>
    {
        cfg.TokenValidationParameters = new TokenValidationParameters()
        {
            ValidateIssuer = true,
            ValidIssuer = tokenConfig["Issuer"],
            ValidateAudience = true,
            ValidAudience = tokenConfig["Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(key),
            ValidateLifetime = true
        };
    });

// Configure Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Cimmple API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme.",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement()
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            }, new List<string>()
        }
    });
});

// CLI: import chart of accounts from CSV. First row may be a header
// (AccountID,AccountCode,...) as produced by Scripts/Normalize-COA-ToMasterSchema.ps1. Example:
//   dotnet run --project Cimmple_API/CimmpleAPI -- import-coa "C:\...\ChartofAccounts_master.csv"
if (args.Length >= 2 && string.Equals(args[0], "import-coa", StringComparison.OrdinalIgnoreCase))
{
    var csvPath = args[1].Trim().Trim('"');
    if (!File.Exists(csvPath))
    {
        Console.Error.WriteLine($"COA CSV not found: {csvPath}");
        Environment.Exit(1);
    }

    var connectionString = builder.Configuration.GetConnectionString("DB")
        ?? throw new InvalidOperationException("ConnectionStrings:DB is not configured.");

    var optionsBuilder = new DbContextOptionsBuilder<CimmpleDbContext>();
    optionsBuilder.UseSqlServer(connectionString);

    using var db = new CimmpleDbContext(optionsBuilder.Options);
    var importOk = false;
    try
    {
        var r = ChartOfAccountsCsvImporter.Import(db, csvPath);
        Console.WriteLine($"Chart of accounts import finished. Updated={r.Updated}, Inserted={r.Inserted}, Skipped={r.Skipped}");
        importOk = true;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"COA import failed: {ex.Message}");
        Log.Fatal(ex, "COA import failed");
    }

    Log.CloseAndFlush();
    Environment.Exit(importOk ? 0 : 1);
}

// CLI: seed typical manufacturing COA rows (idempotent by tenant + account code). Example:
//   dotnet run --project Cimmple_API/CimmpleAPI -- seed-manufacturing-coa
//   dotnet run --project Cimmple_API/CimmpleAPI -- seed-manufacturing-coa 101
if (args.Length >= 1 && string.Equals(args[0], "seed-manufacturing-coa", StringComparison.OrdinalIgnoreCase))
{
    var tenantId = 1;
    if (args.Length >= 2)
    {
        if (!int.TryParse(args[1], out tenantId))
        {
            Console.Error.WriteLine($"Invalid tenant id: {args[1]}");
            Environment.Exit(1);
        }
    }

    var connectionString = builder.Configuration.GetConnectionString("DB")
        ?? throw new InvalidOperationException("ConnectionStrings:DB is not configured.");

    var optionsBuilder = new DbContextOptionsBuilder<CimmpleDbContext>();
    optionsBuilder.UseSqlServer(connectionString);

    using var db = new CimmpleDbContext(optionsBuilder.Options);
    var seedOk = false;
    try
    {
        var (inserted, skipped) = ManufacturingChartOfAccountsSeed.Apply(db, tenantId);
        Console.WriteLine($"Manufacturing COA seed finished for tenant {tenantId}. Inserted={inserted}, Skipped (already present)={skipped}.");
        seedOk = true;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Manufacturing COA seed failed: {ex.Message}");
        Log.Fatal(ex, "Manufacturing COA seed failed");
    }

    Log.CloseAndFlush();
    Environment.Exit(seedOk ? 0 : 1);
}

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Cimmple API V1");
    });
}
else
{
    // Only redirect HTTP to HTTPS in non-development environments
    app.UseHttpsRedirection();
}

// CORS must be before other middleware, especially before UseAuthentication
app.UseCors("_CorsPolicy");

// Enable static files for document downloads
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

try
{
    Log.Information("Starting Cimmple API");
    Console.WriteLine("Starting Cimmple API...");
    Console.WriteLine("Environment: " + app.Environment.EnvironmentName);
    Console.WriteLine("Listening on: http://localhost:5172");
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Host terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}
