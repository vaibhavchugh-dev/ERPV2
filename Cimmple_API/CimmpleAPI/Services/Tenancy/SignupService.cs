using System.Net.Mail;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CimmpleAPI.Services.Tenancy
{
    /// <summary>
    /// Public side of trial signup: validates the form and queues a <see cref="SignupRequest"/>.
    /// It never creates the client itself; <see cref="SignupProvisioningService"/> does that in the background.
    /// </summary>
    public class SignupService
    {
        /// <summary>Stops a distributed flood from queuing an unbounded amount of provisioning work.</summary>
        private const int MaxPendingRequests = 200;

        private readonly CimmpleDbContext _db;
        private readonly SignupOptions _options;
        private readonly SignupWakeSignal _signal;
        private readonly ILogger<SignupService> _logger;

        public SignupService(
            CimmpleDbContext db,
            IOptions<SignupOptions> options,
            SignupWakeSignal signal,
            ILogger<SignupService> logger)
        {
            _db = db;
            _options = options.Value;
            _signal = signal;
            _logger = logger;
        }

        public async Task<SignupOutcome> RegisterAsync(SignupRegistration? input, string? ipAddress)
        {
            if (!_options.Enabled)
                return SignupOutcome.Disabled();

            var error = Validate(input);
            if (error != null)
                return SignupOutcome.Invalid(error);

            var firstName = input!.FirstName!.Trim();
            var lastName = input.LastName!.Trim();
            var companyName = input.CompanyName!.Trim();
            var email = input.Email!.Trim();
            var ip = ipAddress?.Length > 45 ? ipAddress[..45] : ipAddress;

            await SignupSchemaService.EnsureAsync(_db);

            var now = DateTime.UtcNow;

            if (!string.IsNullOrEmpty(ip) && _options.MaxRequestsPerIpPerHour > 0)
            {
                var since = now.AddHours(-1);
                var fromIp = await _db.SignupRequests.AsNoTracking()
                    .CountAsync(s => s.IpAddress == ip && s.CreatedUtc >= since);
                if (fromIp >= _options.MaxRequestsPerIpPerHour)
                    return SignupOutcome.RateLimited();
            }

            var open = _db.SignupRequests.AsNoTracking()
                .Where(s => s.Status == SignupRequest.StatusPending || s.Status == SignupRequest.StatusProcessing);
            if (await open.Take(MaxPendingRequests).CountAsync() >= MaxPendingRequests)
                return SignupOutcome.RateLimited();

            // Repeat submits and existing accounts look the same to the caller, so the form cannot be
            // used to find out which emails are registered. The administrator username is the email.
            if (await open.AnyAsync(s => s.Email == email)
                || await _db.UserDetails.AsNoTracking().AnyAsync(u => u.UserName == email))
            {
                _logger.LogInformation("Signup ignored: {Email} already has an account or a pending signup", email);
                return SignupOutcome.Accepted();
            }

            _db.SignupRequests.Add(new SignupRequest
            {
                FirstName = firstName,
                LastName = lastName,
                CompanyName = companyName,
                Email = email,
                IpAddress = ip,
                Status = SignupRequest.StatusPending,
                CreatedUtc = now
            });
            await _db.SaveChangesAsync();

            _signal.Wake();
            return SignupOutcome.Accepted();
        }

        private static string? Validate(SignupRegistration? input)
        {
            if (input == null) return "Request is required.";
            if (string.IsNullOrWhiteSpace(input.FirstName)) return "First name is required.";
            if (input.FirstName.Trim().Length > 100) return "First name must be 100 characters or fewer.";
            if (string.IsNullOrWhiteSpace(input.LastName)) return "Last name is required.";
            if (input.LastName.Trim().Length > 100) return "Last name must be 100 characters or fewer.";
            if (string.IsNullOrWhiteSpace(input.CompanyName)) return "Company name is required.";
            if (input.CompanyName.Trim().Length > 200) return "Company name must be 200 characters or fewer.";
            if (string.IsNullOrWhiteSpace(input.Email) || input.Email.Trim().Length > 200 || !IsValidEmail(input.Email.Trim()))
                return "A valid email address is required.";
            return null;
        }

        private static bool IsValidEmail(string email)
        {
            try
            {
                return new MailAddress(email).Address.Equals(email, StringComparison.OrdinalIgnoreCase);
            }
            catch (FormatException)
            {
                return false;
            }
        }
    }

    public class SignupRegistration
    {
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? CompanyName { get; set; }
        public string? Email { get; set; }
    }

    public enum SignupOutcomeKind
    {
        Accepted,
        Invalid,
        RateLimited,
        Disabled
    }

    public readonly record struct SignupOutcome(SignupOutcomeKind Kind, string? Error = null)
    {
        public static SignupOutcome Accepted() => new(SignupOutcomeKind.Accepted);
        public static SignupOutcome Invalid(string error) => new(SignupOutcomeKind.Invalid, error);
        public static SignupOutcome RateLimited() => new(SignupOutcomeKind.RateLimited);
        public static SignupOutcome Disabled() => new(SignupOutcomeKind.Disabled);
    }
}
