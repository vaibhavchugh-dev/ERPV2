using System.Security.Cryptography;
using System.Text;

namespace CimmpleAPI.Services
{
    public class DocumentStorageService
    {
        private readonly IWebHostEnvironment _environment;
        private readonly string _baseUploadPath;

        public DocumentStorageService(IWebHostEnvironment environment)
        {
            _environment = environment;
            _baseUploadPath = Path.Combine(_environment.ContentRootPath, "wwwroot", "uploads", "documents");
            
            // Ensure base directory exists
            if (!Directory.Exists(_baseUploadPath))
            {
                Directory.CreateDirectory(_baseUploadPath);
            }
        }

        /// <summary>
        /// Saves a file to disk and returns the relative path
        /// </summary>
        public async Task<string> SaveFileAsync(Stream fileStream, int tenantId, int documentId, string fileName, bool isVersion = false, int? versionNumber = null)
        {
            // Create tenant directory
            var tenantPath = Path.Combine(_baseUploadPath, tenantId.ToString());
            if (!Directory.Exists(tenantPath))
            {
                Directory.CreateDirectory(tenantPath);
            }

            // Create document directory
            var documentPath = Path.Combine(tenantPath, documentId.ToString());
            if (!Directory.Exists(documentPath))
            {
                Directory.CreateDirectory(documentPath);
            }

            // For versions, create version subdirectory
            string finalPath;
            if (isVersion && versionNumber.HasValue)
            {
                var versionPath = Path.Combine(documentPath, $"v{versionNumber.Value}");
                if (!Directory.Exists(versionPath))
                {
                    Directory.CreateDirectory(versionPath);
                }
                finalPath = versionPath;
            }
            else
            {
                finalPath = documentPath;
            }

            // Generate unique filename with timestamp
            var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
            var fileExtension = Path.GetExtension(fileName);
            var baseFileName = Path.GetFileNameWithoutExtension(fileName);
            var uniqueFileName = $"{baseFileName}_{timestamp}{fileExtension}";
            var fullPath = Path.Combine(finalPath, uniqueFileName);

            // Save file
            using (var fileStreamOut = new FileStream(fullPath, FileMode.Create))
            {
                await fileStream.CopyToAsync(fileStreamOut);
            }

            // Return relative path from wwwroot
            var relativePath = Path.Combine("uploads", "documents", tenantId.ToString(), documentId.ToString(), 
                isVersion && versionNumber.HasValue ? $"v{versionNumber.Value}" : "", uniqueFileName)
                .Replace('\\', '/');

            return relativePath;
        }

        /// <summary>
        /// Gets the full file path from a relative path
        /// </summary>
        public string GetFullPath(string relativePath)
        {
            return Path.Combine(_environment.ContentRootPath, "wwwroot", relativePath);
        }

        /// <summary>
        /// Gets file stream for reading
        /// </summary>
        public FileStream GetFileStream(string relativePath)
        {
            var fullPath = GetFullPath(relativePath);
            if (!File.Exists(fullPath))
            {
                throw new FileNotFoundException($"File not found: {relativePath}");
            }
            return new FileStream(fullPath, FileMode.Open, FileAccess.Read);
        }

        /// <summary>
        /// Deletes a file
        /// </summary>
        public void DeleteFile(string relativePath)
        {
            var fullPath = GetFullPath(relativePath);
            if (File.Exists(fullPath))
            {
                File.Delete(fullPath);
            }
        }

        /// <summary>
        /// Deletes a directory and all its contents
        /// </summary>
        public void DeleteDirectory(string relativePath)
        {
            var fullPath = GetFullPath(relativePath);
            if (Directory.Exists(fullPath))
            {
                Directory.Delete(fullPath, true);
            }
        }

        /// <summary>
        /// Calculates SHA-256 hash of a file
        /// </summary>
        public async Task<string> CalculateFileHashAsync(Stream fileStream)
        {
            using (var sha256 = SHA256.Create())
            {
                fileStream.Position = 0;
                var hashBytes = await sha256.ComputeHashAsync(fileStream);
                fileStream.Position = 0;
                return BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
            }
        }

        /// <summary>
        /// Gets file size in bytes
        /// </summary>
        public long GetFileSize(string relativePath)
        {
            var fullPath = GetFullPath(relativePath);
            if (File.Exists(fullPath))
            {
                return new FileInfo(fullPath).Length;
            }
            return 0;
        }

        /// <summary>
        /// Checks if file exists
        /// </summary>
        public bool FileExists(string relativePath)
        {
            var fullPath = GetFullPath(relativePath);
            return File.Exists(fullPath);
        }
    }
}
















