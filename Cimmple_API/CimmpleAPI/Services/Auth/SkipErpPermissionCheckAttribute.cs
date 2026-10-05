using System;

namespace CimmpleAPI.Services.Auth
{
    /// <summary>Skips ERP permission URL checks (auth still required unless [AllowAnonymous]).</summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false, Inherited = true)]
    public sealed class SkipErpPermissionCheckAttribute : Attribute
    {
    }
}
