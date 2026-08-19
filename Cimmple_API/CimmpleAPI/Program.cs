using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Text;
using System.Text.Json;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Repositories;
using CimmpleAPI.Services;
using CimmpleAPI.Services.Auth;
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
builder.Services.AddScoped<CimmpleAPI.Services.FaceRecognitionService>();

// Legacy user repository (UserController login / maintenance helpers)
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IUserRepository, UserRepository>();

// Auth services
builder.Services.Configure<TokenConfigOptions>(builder.Configuration.GetSection(TokenConfigOptions.SectionName));
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<IAuthService, AuthService>();

// Configure JWT Authentication
var tokenConfig = builder.Configuration.GetSection(TokenConfigOptions.SectionName);
var keyString = tokenConfig["Key"] ?? "ChangeThisToALongSecureSecretKeyAtLeast32Chars!";
var key = Encoding.UTF8.GetBytes(keyString);
if (key.Length < 32)
{
    Array.Resize(ref key, 32);
}

builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(cfg =>
    {
        cfg.TokenValidationParameters = new TokenValidationParameters()
        {
            ValidateIssuer = true,
            ValidIssuer = tokenConfig["Issuer"] ?? "CimmpleAPI",
            ValidateAudience = true,
            ValidAudience = tokenConfig["Audience"] ?? "CimmpleUI",
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(key),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
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

// CLI: seed the canonical manufacturing Chart of Accounts (idempotent by tenant + account code).
// Does not delete or overwrite existing accounts (including legacy codes). Examples:
//   dotnet run --project Cimmple_API/CimmpleAPI -- seed-coa
//   dotnet run --project Cimmple_API/CimmpleAPI -- seed-coa 101
// Alias: seed-manufacturing-coa (same behavior)
if (args.Length >= 1 &&
    (string.Equals(args[0], "seed-coa", StringComparison.OrdinalIgnoreCase) ||
     string.Equals(args[0], "seed-manufacturing-coa", StringComparison.OrdinalIgnoreCase)))
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
        Console.WriteLine($"Canonical COA seed finished for tenant {tenantId}. Inserted={inserted}, Skipped (already present)={skipped}.");
        seedOk = true;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"COA seed failed: {ex.Message}");
        Log.Fatal(ex, "COA seed failed");
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
