using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace CimmpleAPI.Utilities
{
    /// <summary>
    /// Shared Azure Blob conventions for module attachments (Quotations, Orders, etc.).
    /// Blob path: container "data" / {tenantId}/{moduleFolder}/{blobName}
    /// </summary>
    public static class ModuleFileStorage
    {
        public const string DefaultContainer = "data";
        public const string QuotationsFolder = "Quotations";
        public const string OrdersFolder = "Orders";

        public static string GetDirectory(int tenantId, string moduleFolder)
        {
            return $"{tenantId}/{moduleFolder}";
        }

        public static FileInfor CreateFileInfo(int tenantId, string moduleFolder, string blobFileName, int userId = 0)
        {
            return new FileInfor
            {
                ContainerName = DefaultContainer,
                Dirname = GetDirectory(tenantId, moduleFolder),
                UploadFileName = blobFileName,
                tenantID = tenantId,
                type = moduleFolder,
                userUniqueno = userId
            };
        }

        public static string GetContentType(string? fileNameOrExtension)
        {
            var ext = Path.GetExtension(fileNameOrExtension ?? "").ToLowerInvariant();
            return ext switch
            {
                ".pdf" => "application/pdf",
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".gif" => "image/gif",
                ".webp" => "image/webp",
                ".bmp" => "image/bmp",
                ".tif" or ".tiff" => "image/tiff",
                ".txt" => "text/plain",
                ".csv" => "text/csv",
                ".rtf" => "application/rtf",
                ".doc" => "application/msword",
                ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ".xls" => "application/vnd.ms-excel",
                ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                ".ppt" => "application/vnd.ms-powerpoint",
                ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                ".msg" => "application/vnd.ms-outlook",
                ".eml" => "message/rfc822",
                _ => "application/octet-stream"
            };
        }

        public static string SanitizeFileName(string? name)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                return "attachment";
            }

            return name.Replace(",", "").Replace("\"", "").Trim();
        }

        public static async Task<bool> UploadAsync(
            CimmpleDbContext context,
            IConfiguration? configuration,
            IFormFile file,
            FileInfor fileInfo)
        {
            var uploadFile = new UploadFile(context, configuration);
            return await uploadFile.UploadFileOnServer(new List<IFormFile> { file }, new List<FileInfor> { fileInfo });
        }

        public static byte[]? DownloadBytes(
            CimmpleDbContext context,
            IConfiguration? configuration,
            FileInfor fileInfo)
        {
            var uploadFile = new UploadFile(context, configuration);
            return uploadFile.GetFilebyte(fileInfo);
        }

        public static async Task<bool> DeleteAsync(
            CimmpleDbContext context,
            IConfiguration? configuration,
            FileInfor fileInfo)
        {
            var uploadFile = new UploadFile(context, configuration);
            return await uploadFile.DeleteFileOnServer(new List<FileInfor> { fileInfo });
        }

        public static async Task DeleteManyAsync(
            CimmpleDbContext context,
            IConfiguration? configuration,
            IEnumerable<FileInfor> fileInfos)
        {
            var list = fileInfos?.ToList() ?? new List<FileInfor>();
            if (list.Count == 0)
            {
                return;
            }

            var uploadFile = new UploadFile(context, configuration);
            await uploadFile.DeleteFileOnServer(list);
        }

        public static async Task<bool> UploadBytesAsync(
            CimmpleDbContext context,
            IConfiguration? configuration,
            byte[] content,
            FileInfor fileInfo)
        {
            if (content == null || content.Length == 0 || fileInfo == null)
            {
                return false;
            }

            var uploadFile = new UploadFile(context, configuration);
            return await uploadFile.UploadBytesOnServer(content, fileInfo);
        }

        /// <summary>
        /// Downloads a blob and re-uploads it under a new module folder / blob name (independent copy).
        /// </summary>
        public static async Task<bool> CopyBlobAsync(
            CimmpleDbContext context,
            IConfiguration? configuration,
            FileInfor source,
            FileInfor destination)
        {
            var bytes = DownloadBytes(context, configuration, source);
            if (bytes == null || bytes.Length == 0)
            {
                return false;
            }

            return await UploadBytesAsync(context, configuration, bytes, destination);
        }
    }
}
