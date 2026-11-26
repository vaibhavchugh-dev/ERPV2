namespace CimmpleAPI.Services.Tenancy
{
    /// <summary>
    /// Lets the signup endpoint wake the provisioning worker immediately instead of waiting for its
    /// next poll. The worker still polls, so signups queued by another API instance are picked up too.
    /// </summary>
    public sealed class SignupWakeSignal
    {
        private readonly SemaphoreSlim _signal = new(0, 1);

        public void Wake()
        {
            try
            {
                _signal.Release();
            }
            catch (SemaphoreFullException)
            {
                // A wake-up is already pending.
            }
        }

        /// <summary>Returns when woken or when <paramref name="timeout"/> elapses.</summary>
        public Task<bool> WaitAsync(TimeSpan timeout, CancellationToken cancellationToken) =>
            _signal.WaitAsync(timeout, cancellationToken);
    }
}
