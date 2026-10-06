using CimmpleAPI.Data;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Repositories;
using CimmpleAPI.Services;
using CimmpleAPI.Utilities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace CimmpleAPI.Controllers
{
    /// <summary>
    /// Legacy user endpoints. Sign-in, refresh and password change live in AuthController.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class UserController : ApiBaseController
    {
        private readonly IUserRepository _userRepository;
        private readonly IConfiguration _configuration;
        private readonly CimmpleDbContext _context;
        private readonly ILogger<UserController> _logger;

        public UserController(
            IUserRepository userRepository,
            IConfiguration configuration,
            CimmpleDbContext context,
            ILogger<UserController> logger)
        {
            _userRepository = userRepository;
            _configuration = configuration;
            _context = context;
            _logger = logger;
        }

        [HttpGet("ValidateUserStatusNew")]
        [AllowAnonymous]
        public IActionResult ValidateUserStatusNew(string userName, string TenantID)
        {
            var isValid = _userRepository.ValidateUserNew(userName, TenantID);
            return Ok(new JsonResponse(200, true, "true", isValid));
        }

        [HttpGet("UnderMaintenance")]
        [AllowAnonymous]
        public IActionResult UnderMaintenance()
        {
            var response = MaintenanceMode.IsEnabled(_configuration) ? 1 : 0;
            return Ok(new JsonResponse(200, true, "success", response));
        }

        [HttpGet("GetProfilePic")]
        public IActionResult GetProfilePic([FromQuery] int userId)
        {
            try
            {
                var tenantId = GetTenantId();
                var user = _context.UserDetails.AsNoTracking()
                    .FirstOrDefault(u => u.User_UniqueID == userId && u.TenantID == tenantId);

                UploadFile uploadfile = new UploadFile(_context, _configuration);
                if (user != null && !string.IsNullOrEmpty(user.ProfilePic))
                {
                    string fileName = Path.GetFileName(user.ProfilePic);
                    var fileInfo = new FileInfor
                    {
                        ContainerName = "data",
                        Dirname = "ProfilePic/" + tenantId + "/" + userId,
                        UploadFileName = fileName,
                        tenantID = tenantId,
                        type = "profilepic",
                        userUniqueno = userId
                    };

                    byte[]? blobBytes = uploadfile.GetFilebyte(fileInfo);
                    if (blobBytes != null && blobBytes.Length > 0)
                    {
                        var ext = Path.GetExtension(fileName).ToLower();
                        var contentType = ext switch
                        {
                            ".png" => "image/png",
                            ".gif" => "image/gif",
                            ".webp" => "image/webp",
                            ".svg" => "image/svg+xml",
                            _ => "image/jpeg"
                        };
                        return File(blobBytes, contentType, fileName);
                    }
                }

                return NotFound("No profile picture found for this user");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch profile picture for user {UserId}.", userId);
                return StatusCode(500, "Failed to fetch profile picture");
            }
        }
    }
}
