using System;

namespace CimmpleAPI.Services.Auth
{
    /// <summary>
    /// Lets tokens without a tenant (support / platform staff, tenantId = 0) call the endpoint.
    /// Any tenant id in the request must still be 0 or absent.
    /// </summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false, Inherited = true)]
    public sealed class AllowTenantlessCallerAttribute : Attribute
    {
    }

    /// <summary>
    /// Turns off <see cref="TenantScopeFilter"/> for the endpoint. The endpoint must authorize the
    /// caller and choose the tenant itself (platform administration only).
    /// </summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false, Inherited = true)]
    public sealed class SkipTenantScopeAttribute : Attribute
    {
    }
}
