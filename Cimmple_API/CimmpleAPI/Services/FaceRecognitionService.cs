using CimmpleAPI.Data;
using CimmpleAPI.Data.Models.Punch;
using Microsoft.EntityFrameworkCore;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace CimmpleAPI.Services
{
    public class FaceRecognitionService
    {
        public const double MatchThreshold = 0.75;

        private readonly CimmpleDbContext _db;
        private readonly IConfiguration _configuration;

        public FaceRecognitionService(CimmpleDbContext db, IConfiguration configuration)
        {
            _db = db;
            _configuration = configuration;
        }

        public bool IsConfigured =>
            !string.IsNullOrWhiteSpace(Endpoint) && !string.IsNullOrWhiteSpace(Key);

        private string Endpoint => (_configuration["AzureFace:Endpoint"] ?? "").TrimEnd('/');
        private string Key => _configuration["AzureFace:Key"] ?? "";
        private string Prefix =>
            string.IsNullOrWhiteSpace(_configuration["FaceRecognition:PersonGroupPrefix"])
                ? "erpv2_tenant_"
                : _configuration["FaceRecognition:PersonGroupPrefix"]!;

        public string PersonGroupId(int tenantId) => $"{Prefix}{tenantId}";

        public async Task<(bool enrolled, string message)> EnrollFromFileAsync(
            int tenantId,
            int userUniqueId,
            IFormFile file)
        {
            if (file == null || file.Length == 0)
            {
                return (false, "No image provided");
            }

            if (!IsConfigured)
            {
                return (false, "Azure Face is not configured. Photo can still be saved as a profile picture.");
            }

            var bytes = await ReadAllBytesAsync(file);
            return await EnrollFromBytesAsync(tenantId, userUniqueId, bytes);
        }

        public async Task<(bool enrolled, string message)> EnrollFromBytesAsync(
            int tenantId,
            int userUniqueId,
            byte[] bytes)
        {
            if (bytes == null || bytes.Length == 0)
            {
                return (false, "No image provided");
            }

            if (!IsConfigured)
            {
                return (false, "Azure Face is not configured. Photo can still be saved as a profile picture.");
            }

            var detect = await DetectAsync(bytes);
            if (!detect.ok)
            {
                return (false, detect.message);
            }

            await EnsurePersonGroupExistsAsync(tenantId);

            var face = await _db.EmployeeFace
                .FirstOrDefaultAsync(f => f.TenantId == tenantId && f.UserUniqueId == userUniqueId);

            if (face == null)
            {
                face = new EmployeeFace
                {
                    TenantId = tenantId,
                    UserUniqueId = userUniqueId,
                    CreatedUtc = DateTime.UtcNow
                };
                _db.EmployeeFace.Add(face);
            }

            if (string.IsNullOrEmpty(face.AzurePersonId))
            {
                face.AzurePersonId = await CreatePersonAsync(tenantId, userUniqueId.ToString());
            }

            if (!string.IsNullOrEmpty(face.AzurePersistedFaceId))
            {
                await DeletePersistedFaceAsync(tenantId, face.AzurePersonId!, face.AzurePersistedFaceId!);
            }

            face.AzurePersistedFaceId = await AddPersistedFaceAsync(tenantId, face.AzurePersonId!, bytes);
            face.AzureFaceRegistered = true;
            face.AzureFaceLastSync = DateTime.UtcNow;
            face.FaceApprovalPending = false;
            face.PendingImagePath = null;
            face.UpdatedUtc = DateTime.UtcNow;

            await _db.SaveChangesAsync();
            await TrainPersonGroupAsync(tenantId);

            return (true, "Face enrolled");
        }

        public async Task<(bool ok, string message, string faceId)> DetectAsync(byte[] image)
        {
            if (!IsConfigured)
            {
                return (false, "Azure Face is not configured", "");
            }

            using var client = CreateClient();
            using var content = new ByteArrayContent(image);
            content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");

            var url = Endpoint
                + "/face/v1.0/detect?returnFaceId=true&recognitionModel=recognition_04"
                + "&detectionModel=detection_01&returnFaceAttributes=qualityForRecognition";

            var response = await client.PostAsync(url, content);
            var json = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                return (false, "Face detection failed", "");
            }

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.GetArrayLength() == 0)
            {
                return (false, "No face detected", "");
            }

            if (root.GetArrayLength() > 1)
            {
                return (false, "Multiple faces detected", "");
            }

            var face = root[0];
            if (face.TryGetProperty("faceAttributes", out var attrs) &&
                attrs.TryGetProperty("qualityForRecognition", out var qualityProp))
            {
                var quality = qualityProp.GetString();
                if (!string.IsNullOrWhiteSpace(quality) &&
                    quality.Equals("low", StringComparison.OrdinalIgnoreCase))
                {
                    return (false, "Poor image quality", "");
                }
            }

            var faceId = face.GetProperty("faceId").GetString() ?? "";
            return (true, "VALID", faceId);
        }

        public async Task<(bool isIdentical, double confidence)> VerifyAsync(
            string faceId,
            int tenantId,
            string personId)
        {
            using var client = CreateClient();
            var body = new
            {
                faceId,
                personId,
                personGroupId = PersonGroupId(tenantId)
            };
            var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
            var response = await client.PostAsync(Endpoint + "/face/v1.0/verify", content);
            if (!response.IsSuccessStatusCode)
            {
                return (false, 0);
            }

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            var identical = doc.RootElement.TryGetProperty("isIdentical", out var idEl) && idEl.GetBoolean();
            var confidence = doc.RootElement.TryGetProperty("confidence", out var confEl)
                ? confEl.GetDouble()
                : 0;
            return (identical, confidence);
        }

        private async Task EnsurePersonGroupExistsAsync(int tenantId)
        {
            var groupId = PersonGroupId(tenantId);
            using var client = CreateClient();
            var get = await client.GetAsync($"{Endpoint}/face/v1.0/persongroups/{groupId}");
            if (get.IsSuccessStatusCode) return;

            var body = new { name = groupId, recognitionModel = "recognition_04" };
            var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
            await client.PutAsync($"{Endpoint}/face/v1.0/persongroups/{groupId}", content);
        }

        private async Task<string> CreatePersonAsync(int tenantId, string userId)
        {
            using var client = CreateClient();
            var body = new { name = userId };
            var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
            var response = await client.PostAsync(
                $"{Endpoint}/face/v1.0/persongroups/{PersonGroupId(tenantId)}/persons",
                content);
            var json = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException(json);
            }

            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.GetProperty("personId").GetString() ?? "";
        }

        private async Task DeletePersistedFaceAsync(int tenantId, string personId, string persistedFaceId)
        {
            using var client = CreateClient();
            await client.DeleteAsync(
                $"{Endpoint}/face/v1.0/persongroups/{PersonGroupId(tenantId)}/persons/{personId}/persistedFaces/{persistedFaceId}");
        }

        private async Task<string> AddPersistedFaceAsync(int tenantId, string personId, byte[] image)
        {
            using var client = CreateClient();
            using var content = new ByteArrayContent(image);
            content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            var url =
                $"{Endpoint}/face/v1.0/persongroups/{PersonGroupId(tenantId)}/persons/{personId}/persistedFaces"
                + "?detectionModel=detection_03";
            var response = await client.PostAsync(url, content);
            var json = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException(json);
            }

            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.GetProperty("persistedFaceId").GetString() ?? "";
        }

        private async Task TrainPersonGroupAsync(int tenantId)
        {
            using var client = CreateClient();
            await client.PostAsync(
                $"{Endpoint}/face/v1.0/persongroups/{PersonGroupId(tenantId)}/train",
                null);
        }

        private HttpClient CreateClient()
        {
            var client = new HttpClient();
            client.DefaultRequestHeaders.Add("Ocp-Apim-Subscription-Key", Key);
            return client;
        }

        private static async Task<byte[]> ReadAllBytesAsync(IFormFile file)
        {
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            return ms.ToArray();
        }
    }
}
