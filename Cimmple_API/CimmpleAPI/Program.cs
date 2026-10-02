using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Reflection;
using System.Text;
using System.Text.Json;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Repositories;
using CimmpleAPI.Services;
using CimmpleAPI.Services.Auth;
using Serilog;

AppDomain.CurrentDomain.AssemblyResolve += (_, args) =>
{
    var requested = new AssemblyName(args.Name);
    if (!string.Equals(requested.Name, "System.Text.Encoding.CodePages", StringComparison.OrdinalIgnoreCase))
        return null;

    var path = Path.Combine(AppContext.BaseDirectory, "System.Text.Encoding.CodePages.dll");
    return File.Exists(path) ? Assembly.LoadFrom(path) : null;
};

var builder = WebApplication.CreateBuilder(args);

// For local development only: bind a predictable URL for 'dotnet run'.
// Do NOT set this in Production — IIS/ANCM must control the listen URL.
if (builder.Environment.IsDevelopment())
{
    builder.WebHost.UseUrls("http://localhost:5172");
}

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
// Configure CORS
builder.Services.AddCors(c =>
{
    c.AddPolicy("_CorsPolicy", options =>
    {
        options
            .WithOrigins(
                "https://erp.cimmple.net",
                "http://erp.cimmple.net",
                "https://punch.cimmple.net",
                "https://api.v2.cimmple.net",
                "http://api.v2.cimmple.net",
                "http://localhost:3000",
                "http://localhost:5173",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:5173")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

// Configure Entity Framework
builder.Services.AddDbContext<CimmpleDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DB")));

// Register PDF Service
builder.Services.AddScoped<CimmpleAPI.Services.Pdf.PdfService>();
builder.Services.AddScoped<CimmpleAPI.Services.Pdf.DocumentPdfService>();

// Register Document Storage Service
builder.Services.AddScoped<CimmpleAPI.Services.DocumentStorageService>();

// Register Inventory Service
builder.Services.AddScoped<CimmpleAPI.Services.InventoryService>();
builder.Services.AddScoped<CimmpleAPI.Services.FaceRecognitionService>();

// Scheduled report email runner
builder.Services.AddScoped<CimmpleAPI.Services.ReportScheduleExecutionService>();
builder.Services.AddHostedService<CimmpleAPI.Services.ReportScheduleHostedService>();
builder.Services.AddScoped<CimmpleAPI.Services.NotificationService>();
builder.Services.AddScoped<CimmpleAPI.Services.ConversationService>();
builder.Services.AddScoped<CimmpleAPI.Services.EmailOutboxService>();
builder.Services.AddScoped<CimmpleAPI.Services.SupportTicketService>();
builder.Services.AddHostedService<CimmpleAPI.Services.EmailOutboxHostedService>();

// Legacy user repository (UserController helpers)
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IUserRepository, UserRepository>();

// Auth services
builder.Services.Configure<TokenConfigOptions>(builder.Configuration.GetSection(TokenConfigOptions.SectionName));
builder.Services.AddMemoryCache();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<ISessionValidationService, SessionValidationService>();
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
        cfg.Events = new JwtBearerEvents
        {
            // Tokens carrying a session id are rejected once that session is logged out or evicted.
            OnTokenValidated = async context =>
            {
                var principal = context.Principal;
                if (!int.TryParse(principal?.FindFirst(AuthClaimTypes.SessionId)?.Value, out var sessionId) || sessionId <= 0)
                {
                    return;
                }

                int.TryParse(principal?.FindFirst("userId")?.Value, out var userId);
                try
                {
                    var sessions = context.HttpContext.RequestServices.GetRequiredService<ISessionValidationService>();
                    if (!await sessions.IsSessionActiveAsync(sessionId, userId))
                    {
                        context.Fail("Session has ended.");
                    }
                }
                catch (Exception ex)
                {
                    // Refresh still enforces the session; do not lock everyone out on a transient DB error.
                    Log.Warning(ex, "Session validation failed for session {SessionId}", sessionId);
                }
            }
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
    // Duplicate DTO names (e.g. ReportRequest on Reports + Accounting) crash swagger.json with 500.
    c.CustomSchemaIds(type => type.FullName?.Replace("+", ".") ?? type.Name);
    c.MapType<object>(() => new OpenApiSchema { Type = "object", AdditionalPropertiesAllowed = true });
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

// Per-session refresh-token columns must exist before the first refresh or session check.
try
{
    using var schemaScope = app.Services.CreateScope();
    await SystemSettingsSchemaService.EnsureLoginSchemaAsync(
        schemaScope.ServiceProvider.GetRequiredService<CimmpleDbContext>());
}
catch (Exception ex)
{
    Log.Warning(ex, "Login schema check at startup failed; it is retried on login and refresh.");
}

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}
else
{
    // Only redirect HTTP to HTTPS in non-development environments
    app.UseHttpsRedirection();
}

// Swagger publishes every endpoint; outside Development it must be enabled explicitly (Swagger:Enabled).
if (app.Environment.IsDevelopment() || app.Configuration.GetValue<bool>("Swagger:Enabled"))
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Cimmple API V1");
    });
}

// CORS must be before other middleware, especially before UseAuthentication
app.UseCors("_CorsPolicy");

app.Use(async (context, next) =>
{
    if (MaintenanceMode.IsEnabled(app.Configuration)
        && context.Request.Path.StartsWithSegments("/api")
        && !context.Request.Path.StartsWithSegments("/api/User/UnderMaintenance"))
    {
        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await context.Response.WriteAsJsonAsync(new { message = MaintenanceMode.ResponseMessage });
        return;
    }

    await next();
});

// Job template drawings are tenant data: they are only served by the authenticated
// JobTemplate/DownloadJobTemplateAttachment endpoint, never as anonymous static files.
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/uploads/jobtemplates", StringComparison.OrdinalIgnoreCase))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    await next();
});

// Enable static files for document downloads
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        ctx.Context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        // SVG can carry script; never render a stored one in the API origin.
        if (ctx.File.Name.EndsWith(".svg", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Context.Response.Headers["Content-Disposition"] = "attachment";
            ctx.Context.Response.Headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
        }
    }
});

app.UseAuthentication();

// A token issued while a password change is pending may only be used to change the password.
var passwordChangeAllowedPaths = new[]
{
    "/api/Auth/ChangePassword",
    "/api/Auth/Logout",
    "/api/Auth/Me",
    "/api/Auth/Refresh",
    "/api/Auth/RevokeSession",
    "/api/SystemSettings/GetSettings",
    "/api/User/UnderMaintenance"
};
app.Use(async (context, next) =>
{
    if (context.User.Identity?.IsAuthenticated == true
        && string.Equals(context.User.FindFirst(AuthClaimTypes.PasswordChangeRequired)?.Value, "true", StringComparison.OrdinalIgnoreCase)
        && !passwordChangeAllowedPaths.Any(p => context.Request.Path.Equals(p, StringComparison.OrdinalIgnoreCase)))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new { message = "Password change required", mustChangePassword = true });
        return;
    }

    await next();
});

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
