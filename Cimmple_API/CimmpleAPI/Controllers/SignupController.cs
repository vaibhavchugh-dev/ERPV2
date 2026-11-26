using CimmpleAPI.Services.Tenancy;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CimmpleAPI.Controllers
{
    /// <summary>Public self-service trial signup. The client is created in the background.</summary>
    [ApiController]
    [Route("api/[controller]")]
    public class SignupController : ApiBaseController
    {
        private const string AcceptedMessage =
            "Thanks for signing up. Your login details will be emailed to you shortly.";

        private readonly SignupService _signup;
        private readonly ILogger<SignupController> _logger;

        public SignupController(SignupService signup, ILogger<SignupController> logger)
        {
            _signup = signup;
            _logger = logger;
        }

        [AllowAnonymous]
        [HttpPost("Register")]
        public async Task<IActionResult> Register([FromBody] SignupFormRequest? request)
        {
            try
            {
                var outcome = await _signup.RegisterAsync(
                    request == null
                        ? null
                        : new SignupRegistration
                        {
                            FirstName = request.FirstName,
                            LastName = request.LastName,
                            CompanyName = request.CompanyName,
                            Email = request.Email
                        },
                    HttpContext.Connection.RemoteIpAddress?.ToString());

                return outcome.Kind switch
                {
                    SignupOutcomeKind.Accepted => Accepted(new { message = AcceptedMessage }),
                    SignupOutcomeKind.Invalid => BadRequest(new { message = outcome.Error }),
                    SignupOutcomeKind.RateLimited => StatusCode(StatusCodes.Status429TooManyRequests,
                        new { message = "Too many signup requests. Please try again later." }),
                    _ => StatusCode(StatusCodes.Status503ServiceUnavailable,
                        new { message = "Signup is not available right now. Please contact Cimmple." })
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Trial signup failed.");
                return StatusCode(500, new { message = "We could not complete your signup. Please try again." });
            }
        }
    }

    public class SignupFormRequest
    {
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? CompanyName { get; set; }
        public string? Email { get; set; }
    }
}
