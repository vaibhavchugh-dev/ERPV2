using CimmpleAPI.Data.Dtos;

namespace CimmpleAPI.Data.Repositories
{
    public interface IUserRepository
    {
        ValidateUserStatus ValidateUserNew(string userName, string tenantId);
    }

    public class UserRepository : IUserRepository
    {
        public ValidateUserStatus ValidateUserNew(string userName, string tenantId)
        {
            return new ValidateUserStatus
            {
                RVal = "1",
                Phone = "",
                Email = "",
                PrimaryContact = "",
                IsEmailBlock = "No",
                IsPhoneBlock = "No",
                IsSplPermission = "No",
                DisplayEmail = "No",
                DisplayPhone = "No",
                PhoneStatus = "No"
            };
        }
    }
}
