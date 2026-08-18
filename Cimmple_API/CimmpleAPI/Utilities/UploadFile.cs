using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Blob;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Utilities
{
    public class UploadFile
    {
        private readonly CimmpleDbContext _context;
        private readonly IConfiguration? _configuration;

        public UploadFile(CimmpleDbContext context, IConfiguration? configuration = null)
        {
            _context = context;
            _configuration = configuration;
        }

        private string GetCloudConnectionString()
        {
            string? cloudConn = null;
            if (_configuration != null)
            {
                cloudConn = _configuration["AzureConnection:storageConnectionString"]
                         ?? _configuration["AzureConnString"];
            }

            if (string.IsNullOrEmpty(cloudConn))
            {
                try
                {
                    cloudConn = _context.gcwConfig
                        .Where(e => e.KeyName.ToLower() == "AzureConnString".ToLower())
                        .Select(e => e.KeyValue)
                        .FirstOrDefault();
                }
                catch
                {
                    // gcwConfig table may not exist in database
                }
            }

            return cloudConn ?? "";
        }

        public byte[]? GetFilebyte(FileInfor fileInfo)
        {
            try
            {
                if (fileInfo.tenantID != 0)
                {
                    string FileName = fileInfo.UploadFileName;
                    string CloudConn = GetCloudConnectionString();
                    if (string.IsNullOrEmpty(CloudConn)) return null;

                    CloudStorageAccount account = CloudStorageAccount.Parse(CloudConn);
                    CloudBlobClient serviceClient = account.CreateCloudBlobClient();
                    var container = serviceClient.GetContainerReference(fileInfo.ContainerName);
                    CloudBlobDirectory Dir = container.GetDirectoryReference(fileInfo.Dirname);
                    Dir.Container.CreateIfNotExistsAsync().Wait();
                    var blob = Dir.GetBlobReference(FileName);
                    
                    if (!blob.ExistsAsync().Result)
                    {
                        return null;
                    }
                    
                    Stream stream = new MemoryStream();
                    blob.DownloadToStreamAsync(stream).Wait();
                    stream.Position = 0;
                    byte[] buffer = new byte[16 * 1024];
                    using (MemoryStream ms = new MemoryStream())
                    {
                        int read;
                        while ((read = stream.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            ms.Write(buffer, 0, read);
                        }

                        return ms.ToArray();
                    }
                }
                else
                { return null; }
            }
            catch (StorageException ex)
            {
                if (ex.RequestInformation?.HttpStatusCode == 404 || ex.RequestInformation?.ErrorCode == "BlobNotFound")
                {
                    return null;
                }
                throw;
            }
            catch 
            {
                throw;
            }
        }

        public async Task<bool> UploadFileOnServer(IEnumerable<IFormFile> files, List<FileInfor> fileInfo)
        {
            try
            {
                string CloudConn = GetCloudConnectionString();
                if (string.IsNullOrEmpty(CloudConn)) return false;

                int Index = 0;
                foreach (FileInfor fileDet in fileInfo)
                {
                    IFormFile file = files.ToList()[Index];
                    string FileName = file.FileName;

                    CloudStorageAccount account = CloudStorageAccount.Parse(CloudConn);
                    CloudBlobClient serviceClient = account.CreateCloudBlobClient();
                    var container = serviceClient.GetContainerReference(fileDet.ContainerName);
                    await container.CreateIfNotExistsAsync();
                    CloudBlobDirectory Dir = container.GetDirectoryReference(fileDet.Dirname);
                    await Dir.Container.CreateIfNotExistsAsync();
                    CloudBlockBlob blob = Dir.GetBlockBlobReference(fileDet.UploadFileName);

                    if (FileName.Length > 0)
                    {
                        using (var stream = file.OpenReadStream())
                        {
                            await blob.UploadFromStreamAsync(stream);
                        }
                    }
                    Index++;
                }

                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }

        public async Task<bool> UploadBytesOnServer(byte[] content, FileInfor fileDet)
        {
            try
            {
                if (content == null || content.Length == 0 || fileDet == null)
                {
                    return false;
                }

                string CloudConn = GetCloudConnectionString();
                if (string.IsNullOrEmpty(CloudConn)) return false;

                CloudStorageAccount account = CloudStorageAccount.Parse(CloudConn);
                CloudBlobClient serviceClient = account.CreateCloudBlobClient();
                var container = serviceClient.GetContainerReference(fileDet.ContainerName);
                await container.CreateIfNotExistsAsync();
                CloudBlobDirectory Dir = container.GetDirectoryReference(fileDet.Dirname);
                await Dir.Container.CreateIfNotExistsAsync();
                CloudBlockBlob blob = Dir.GetBlockBlobReference(fileDet.UploadFileName);

                using (var stream = new MemoryStream(content))
                {
                    await blob.UploadFromStreamAsync(stream);
                }

                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }

        public async Task<bool> DeleteFileOnServer(List<FileInfor> fileInfo)
        {
            try
            {
                string CloudConn = GetCloudConnectionString();
                if (string.IsNullOrEmpty(CloudConn)) return false;

                foreach (FileInfor fileDet in fileInfo)
                {
                    CloudStorageAccount account = CloudStorageAccount.Parse(CloudConn);
                    CloudBlobClient serviceClient = account.CreateCloudBlobClient();
                    var container = serviceClient.GetContainerReference(fileDet.ContainerName);
                    try
                    {
                        CloudBlobDirectory Dir = container.GetDirectoryReference(fileDet.Dirname);
                        await Dir.Container.CreateIfNotExistsAsync();
                        CloudBlockBlob blob = Dir.GetBlockBlobReference(fileDet.UploadFileName);

                        await blob.DeleteAsync();
                    }
                    catch (Exception)
                    {
                        return false;
                    }
                }

                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }
    }
}
