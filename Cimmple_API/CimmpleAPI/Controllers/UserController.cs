using CimmpleAPI.Data;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Repositories;
using CimmpleAPI.Utilities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Blob;
using System;
using System.Collections.Generic;
using System.IO;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UserController : ApiBaseController
    {
        private readonly IUserRepository _userRepository;
        private readonly IConfiguration _configuration;
        private readonly CimmpleDbContext _context;
        private readonly IWebHostEnvironment _environment;
        private const string LoginTokenDurationMinutes = "6000";
        private const string LogoutPopupTime = "6000";

        public UserController(IUserRepository userRepository, IConfiguration configuration, CimmpleDbContext context, IWebHostEnvironment environment)
        {
            _userRepository = userRepository;
            _configuration = configuration;
            _context = context;
            _environment = environment;
        }

        [HttpPost("Login")]
        [AllowAnonymous]
        public IActionResult Login([FromBody] LoginModel model)
        {
            if (string.IsNullOrEmpty(model.password))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, "Invalid password");
            }

            var user = _userRepository.AuthenticateUser(model.userName ?? "", model.password);
            if (user == null)
            {
                var errorMessage = string.Concat("Incorrect password entered for ", model.userName);
                return Ok(new { success = false, message = errorMessage, token = "", user = new LoginUserDto { User_UniqueID = 0 } });
            }

            var userDto = _userRepository.Authenticate(
                model.userName ?? "",
                model.password,
                model.GUID,
                model.LoginHID);

            if (userDto == null)
            {
                var errorMessage = string.Concat("Login failed for username: ", model.userName);
                return Unauthorized(new JsonResponse(401, false, errorMessage));
            }

            if (userDto.Message != "success")
            {
                return Ok(BuildFailureResponse(userDto));
            }

            var token = CreateToken(userDto, model.Nonce);
            userDto.mergeToken = token;
            var expirationTime = DateTime.UtcNow.AddMinutes(int.Parse(LoginTokenDurationMinutes));

            return Ok(new
            {
                success = true,
                token,
                LogoutPopupTime,
                expirationTime,
                user = userDto
            });
        }

        [HttpPost("AutoLogin")]
        [AllowAnonymous]
        public IActionResult AutoLogin([FromBody] LoginModel model)
        {
            if (string.IsNullOrEmpty(model.token))
            {
                return Unauthorized(new JsonResponse(401, false, "Please login"));
            }

            var userDto = _userRepository.AutoAuthenticate(
                model.userName ?? "",
                model.password ?? "",
                model.GUID,
                model.LoginHID);

            if (userDto == null)
            {
                var errorMessage = string.Concat("Login failed for username: ", model.userName);
                return Unauthorized(new JsonResponse(401, false, errorMessage));
            }

            if (userDto.Message != "success")
            {
                return Ok(BuildFailureResponse(userDto));
            }

            var token = CreateToken(userDto, model.Nonce);
            userDto.mergeToken = token;
            var expirationTime = DateTime.UtcNow.AddMinutes(int.Parse(LoginTokenDurationMinutes));

            return Ok(new
            {
                success = true,
                token,
                LogoutPopupTime,
                expirationTime,
                user = userDto
            });
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
            var response = _userRepository.IsUnderMaintenance();
            return Ok(new JsonResponse(200, true, "success", response));
        }

        [HttpGet("GetProfilePic")]
        [AllowAnonymous]
        public IActionResult GetProfilePic([FromQuery] int userId, [FromQuery] int? tenantId)
        {
            try
            {
                var user = _context.UserDetails.AsNoTracking().FirstOrDefault(u => u.User_UniqueID == userId);
                if (user == null || string.IsNullOrEmpty(user.ProfilePic))
                {
                    return NotFound();
                }

                var webRootPath = _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
                var fullPath = Path.Combine(webRootPath, user.ProfilePic.Replace('/', Path.DirectorySeparatorChar));

                if (!System.IO.File.Exists(fullPath))
                {
                    return NotFound();
                }

                var ext = Path.GetExtension(fullPath).ToLower();
                var contentType = ext switch
                {
                    ".png" => "image/png",
                    ".gif" => "image/gif",
                    ".webp" => "image/webp",
                    ".svg" => "image/svg+xml",
                    _ => "image/jpeg"
                };

                return PhysicalFile(fullPath, contentType);
            }
            catch
            {
                return NotFound();
            }
        }

        [HttpPost("ChangePassword")]
        [AllowAnonymous]
        public IActionResult ChangePassword([FromBody] ChangePasswordModel changePassword)
        {
            var response = _userRepository.ChangePassword(changePassword);
            return Ok(new JsonResponse(200, true, "Success", response));
        }

        [HttpPost("ChangePasswordNew")]
        [AllowAnonymous]
        public IActionResult ChangePasswordNew([FromBody] ChangePasswordModelNew changePassword)
        {
            if (string.IsNullOrEmpty(changePassword.oldpassword))
            {
                return StatusCode(StatusCodes.Status500InternalServerError, "Invalid password");
            }

            var user = _userRepository.AuthenticateUser(changePassword.userName ?? "", changePassword.oldpassword);
            if (user == null)
            {
                var errorMessage = string.Concat("Incorrect password entered for ", changePassword.userName);
                return Ok(new { success = false, message = errorMessage });
            }

            var response = _userRepository.ChangePasswordNew(changePassword);
            return Ok(new JsonResponse(200, true, "Success", response));
        }

        private object BuildFailureResponse(LoginUserDto userDto)
        {
            if (userDto.IsLocked == "Yes")
            {
                return new
                {
                    success = false,
                    token = "",
                    user = new LoginUserDto
                    {
                        User_UniqueID = userDto.User_UniqueID,
                        IsManualLocked = null,
                        IsLocked = "Yes",
                        Message = ""
                    }
                };
            }

            if (!string.IsNullOrEmpty(userDto.FailMessage))
            {
                return new
                {
                    success = false,
                    token = "",
                    user = new LoginUserDto2
                    {
                        Message = userDto.FailMessage,
                        IsManualLocked = null,
                        IsLocked = null,
                        User_UniqueID = userDto.User_UniqueID,
                        LockDay = userDto.LockDay
                    }
                };
            }

            return new
            {
                success = false,
                token = "",
                user = new LoginUserDto2
                {
                    Message = "",
                    IsManualLocked = userDto.IsManualLocked,
                    IsLocked = userDto.IsLocked,
                    User_UniqueID = userDto.User_UniqueID,
                    LockDay = userDto.LockDay
                }
            };
        }

        private string CreateToken(LoginUserDto userDto, string? nonce)
        {
            var tokenConfig = _configuration.GetSection("TokenConfig");
            var key = Encoding.ASCII.GetBytes(tokenConfig["Key"] ?? "DefaultKeyForDevelopmentOnly1234567890");
            var signingCredentials = new SigningCredentials(
                new SymmetricSecurityKey(key),
                SecurityAlgorithms.HmacSha256);

            var unixTimeSeconds = new DateTimeOffset(DateTime.UtcNow).ToUnixTimeSeconds();
            var claims = new List<Claim>
            {
                new("uid", userDto.User_UniqueID.ToString()),
                new("username", userDto.UserName ?? ""),
                new("tenantid", userDto.TenantID.ToString()),
                new("sub", userDto.User_UniqueID.ToString()),
                new("email", userDto.Email ?? ""),
                new("iat", unixTimeSeconds.ToString()),
                new("given_name", userDto.FirstName ?? ""),
                new("family_name", userDto.UserName ?? ""),
                new("nonce", nonce ?? "")
            };

            var token = new JwtSecurityToken(
                issuer: tokenConfig["Issuer"],
                audience: tokenConfig["Audience"],
                claims: claims,
                notBefore: DateTime.UtcNow,
                expires: DateTime.UtcNow.AddMinutes(int.Parse(LoginTokenDurationMinutes)),
                signingCredentials: signingCredentials);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        [HttpGet("GetProfilePic")]
        [AllowAnonymous]
        public async Task<IActionResult> GetProfilePic([FromQuery] int tenantId, [FromQuery] int userId)
        {
            try
            {
                var user = _context.UserDetails.AsNoTracking().FirstOrDefault(u => u.User_UniqueID == userId);
                int effTenantId = tenantId != 0 ? tenantId : (user?.TenantID ?? 0);

                UploadFile uploadfile = new UploadFile(_context, _configuration);
                if (user != null && !string.IsNullOrEmpty(user.ProfilePic))
                {
                    string fileName = Path.GetFileName(user.ProfilePic);
                    var fileInfo = new FileInfor
                    {
                        ContainerName = "data",
                        Dirname = "ProfilePic/" + effTenantId + "/" + userId,
                        UploadFileName = fileName,
                        tenantID = effTenantId,
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
                return StatusCode(500, $"Failed to fetch profile picture: {ex.Message}");
            }
        }
    }
}
