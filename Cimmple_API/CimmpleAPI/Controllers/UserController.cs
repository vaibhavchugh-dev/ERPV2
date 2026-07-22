using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Data.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UserController : ApiBaseController
    {
        private readonly IUserRepository _userRepository;
        private readonly IConfiguration _configuration;
        private const string LoginTokenDurationMinutes = "6000";
        private const string LogoutPopupTime = "6000";

        public UserController(IUserRepository userRepository, IConfiguration configuration)
        {
            _userRepository = userRepository;
            _configuration = configuration;
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
    }
}
