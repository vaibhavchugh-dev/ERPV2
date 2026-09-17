using System.Security.Cryptography;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Utilities;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Stores Documents-module files in Azure Blob Storage via ModuleFileStorage.
    /// FilePath values are blob names under data/{tenantId}/Documents/.
    /// Legacy local paths (uploads/documents/...) are still readable if present on disk.
    /// </summary>
    public class DocumentStorageService
    {
        private readonly CimmpleDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly IWebHostEnvironment _environment;
        private readonly string _legacyBaseUploadPath;

        public DocumentStorageService(
            CimmpleDbContext context,
            IConfiguration configuration,
            IWebHostEnvironment environment)
        {
            _context = context;
            _configuration = configuration;
            _environment = environment;
            _legacyBaseUploadPath = Path.Combine(_environment.ContentRootPath, "wwwroot", "uploads", "documents");
        }

        /// <summary>
        /// Uploads a file to Azure and returns the blob name stored in DocumentFile/DocumentVersion.FilePath.
        /// </summary>
        public async Task<string> SaveFileAsync(
            Stream fileStream,
            int tenantId,
            int documentId,
            string fileName,
            bool isVersion = false,
            int? versionNumber = null)
        {
            var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
            var fileExtension = Path.GetExtension(fileName);
            var baseFileName = Path.GetFileNameWithoutExtension(fileName);
            var uniqueFileName = $"{baseFileName}_{timestamp}{fileExtension}";

            // Logical path segments kept in blob name for uniqueness within the Documents folder.
            var blobName = isVersion && versionNumber.HasValue
                ? $"{documentId}/v{versionNumber.Value}/{uniqueFileName}"
                : $"{documentId}/{uniqueFileName}";

            byte[] content;
            if (fileStream.CanSeek)
            {
                fileStream.Position = 0;
            }

            using (var ms = new MemoryStream())
            {
                await fileStream.CopyToAsync(ms);
                content = ms.ToArray();
            }

            if (content.Length == 0)
            {
                throw new InvalidOperationException("Cannot upload an empty file.");
            }

            var fileInfo = ModuleFileStorage.CreateFileInfo(
                tenantId,
                ModuleFileStorage.DocumentsFolder,
                blobName);

            var uploaded = await ModuleFileStorage.UploadBytesAsync(_context, _configuration, content, fileInfo);
            if (!uploaded)
            {
                throw new InvalidOperationException(
                    "Failed to upload document to Azure Storage. Check AzureConnection:storageConnectionString.");
            }

            return blobName;
        }

        /// <summary>
        /// Downloads file bytes from Azure (or legacy local disk if FilePath looks like a relative uploads path).
        /// </summary>
        public byte[]? GetFileBytes(string filePath, int tenantId)
        {
            if (string.IsNullOrWhiteSpace(filePath))
            {
                return null;
            }

            var normalized = filePath.Replace('\\', '/').Trim();

            // 1. Legacy local path (uploads/documents/...)
            if (IsLegacyLocalPath(normalized))
            {
                var fullPath = GetLegacyFullPath(normalized);
                if (File.Exists(fullPath))
                {
                    return File.ReadAllBytes(fullPath);
                }
            }

            // 2. Azure under data/{tenantId}/Documents/{filePath}
            var fileInfo = ModuleFileStorage.CreateFileInfo(
                tenantId,
                ModuleFileStorage.DocumentsFolder,
                normalized);

            var azureBytes = ModuleFileStorage.DownloadBytes(_context, _configuration, fileInfo);
            if (azureBytes != null && azureBytes.Length > 0)
            {
                return azureBytes;
            }

            // 3. Local fallback under wwwroot/uploads/documents/{relative}
            //    (older rows sometimes stored path relative to the documents folder only)
            var underDocs = Path.Combine(
                _legacyBaseUploadPath,
                normalized.Replace('/', Path.DirectorySeparatorChar));
            if (File.Exists(underDocs))
            {
                return File.ReadAllBytes(underDocs);
            }

            // 4. Local fallback under wwwroot/{relative}
            var underWebRoot = Path.Combine(
                _environment.ContentRootPath,
                "wwwroot",
                normalized.Replace('/', Path.DirectorySeparatorChar));
            if (File.Exists(underWebRoot))
            {
                return File.ReadAllBytes(underWebRoot);
            }

            return null;
        }

        /// <summary>
        /// Deletes a blob (or legacy local file). Soft-delete callers may choose to invoke this.
        /// </summary>
        public async Task DeleteFileAsync(string filePath, int tenantId)
        {
            if (string.IsNullOrWhiteSpace(filePath))
            {
                return;
            }

            if (IsLegacyLocalPath(filePath))
            {
                var fullPath = GetLegacyFullPath(filePath);
                if (File.Exists(fullPath))
                {
                    File.Delete(fullPath);
                }

                return;
            }

            var fileInfo = ModuleFileStorage.CreateFileInfo(
                tenantId,
                ModuleFileStorage.DocumentsFolder,
                filePath);

            await ModuleFileStorage.DeleteAsync(_context, _configuration, fileInfo);
        }

        public async Task<string> CalculateFileHashAsync(Stream fileStream)
        {
            using (var sha256 = SHA256.Create())
            {
                if (fileStream.CanSeek)
                {
                    fileStream.Position = 0;
                }

                var hashBytes = await sha256.ComputeHashAsync(fileStream);
                if (fileStream.CanSeek)
                {
                    fileStream.Position = 0;
                }

                return BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
            }
        }

        public bool FileExists(string filePath, int tenantId)
        {
            var bytes = GetFileBytes(filePath, tenantId);
            return bytes != null && bytes.Length > 0;
        }

        private static bool IsLegacyLocalPath(string filePath)
        {
            var normalized = filePath.Replace('\\', '/');
            return normalized.StartsWith("uploads/", StringComparison.OrdinalIgnoreCase)
                   || normalized.Contains("/uploads/", StringComparison.OrdinalIgnoreCase);
        }

        private string GetLegacyFullPath(string relativePath)
        {
            return Path.Combine(_environment.ContentRootPath, "wwwroot", relativePath.Replace('/', Path.DirectorySeparatorChar));
        }
    }
}
