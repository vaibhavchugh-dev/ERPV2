using System.Text.Json;
using System.Text.Json.Serialization;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Comment payload fields used for @mention fan-out. MentionedUserIds is not persisted.
    /// </summary>
    public class CommentMentionSource
    {
        public int Id { get; set; }
        public string Text { get; set; } = "";
        public string CreatedBy { get; set; } = "";
        public List<int>? MentionedUserIds { get; set; }
    }

    public static class CommentMentionHelper
    {
        public const string TypeCommentMention = "CommentMention";

        private static readonly JsonSerializerOptions PersistOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            WriteIndented = false
        };

        public static async Task NotifyAsync(
            NotificationService notifications,
            int tenantId,
            int? actorUserId,
            IEnumerable<CommentMentionSource>? comments,
            string entityType,
            int entityId,
            string entityLabel,
            string linkPath)
        {
            if (notifications == null || tenantId <= 0 || entityId <= 0 || comments == null)
                return;

            foreach (var comment in comments)
            {
                var mentioned = comment.MentionedUserIds?
                    .Where(id => id > 0)
                    .Distinct()
                    .ToList();
                if (mentioned == null || mentioned.Count == 0)
                    continue;

                var snippet = (comment.Text ?? "").Trim();
                if (snippet.Length > 240)
                    snippet = snippet.Substring(0, 240) + "…";

                var actorLabel = string.IsNullOrWhiteSpace(comment.CreatedBy) ? "A teammate" : comment.CreatedBy.Trim();
                var title = $"{actorLabel} mentioned you";
                var body = string.IsNullOrWhiteSpace(snippet)
                    ? $"On {entityLabel}"
                    : $"On {entityLabel}: {snippet}";

                foreach (var recipientId in mentioned)
                {
                    if (actorUserId.HasValue && recipientId == actorUserId.Value)
                        continue;

                    try
                    {
                        await notifications.CreateAsync(new NotificationCreateRequest
                        {
                            TenantId = tenantId,
                            RecipientUserId = recipientId,
                            ActorUserId = actorUserId,
                            Type = TypeCommentMention,
                            Title = title,
                            Body = body,
                            EntityType = entityType,
                            EntityId = entityId,
                            LinkPath = linkPath,
                            SendEmail = false
                        });
                    }
                    catch
                    {
                        // Soft-fail: comment save must not fail if notify fails
                    }
                }
            }
        }

        /// <summary>Map typed comment DTOs that expose MentionedUserIds / mentionedUserIds.</summary>
        public static List<CommentMentionSource> FromDtos<T>(IEnumerable<T>? comments)
        {
            var list = new List<CommentMentionSource>();
            if (comments == null) return list;

            foreach (var c in comments)
            {
                if (c == null) continue;
                var type = c.GetType();
                var idProp = type.GetProperty("Id") ?? type.GetProperty("id");
                var textProp = type.GetProperty("Text") ?? type.GetProperty("text");
                var byProp = type.GetProperty("CreatedBy") ?? type.GetProperty("createdBy");
                var mentionProp = type.GetProperty("MentionedUserIds") ?? type.GetProperty("mentionedUserIds");
                var mentioned = ExtractMentionIds(mentionProp?.GetValue(c));
                list.Add(new CommentMentionSource
                {
                    Id = idProp?.GetValue(c) is int id ? id : 0,
                    Text = textProp?.GetValue(c)?.ToString() ?? "",
                    CreatedBy = byProp?.GetValue(c)?.ToString() ?? "",
                    MentionedUserIds = mentioned
                });
            }

            return list;
        }

        private static List<int>? ExtractMentionIds(object? value)
        {
            if (value == null) return null;
            if (value is IEnumerable<int> ints)
            {
                var list = ints.Where(i => i > 0).Distinct().ToList();
                return list.Count > 0 ? list : null;
            }

            if (value is System.Collections.IEnumerable enumerable && value is not string)
            {
                var list = new List<int>();
                foreach (var item in enumerable)
                {
                    switch (item)
                    {
                        case int i when i > 0:
                            list.Add(i);
                            break;
                        case long l when l > 0 && l <= int.MaxValue:
                            list.Add((int)l);
                            break;
                        case JsonElement je when je.ValueKind == JsonValueKind.Number && je.TryGetInt32(out var jid) && jid > 0:
                            list.Add(jid);
                            break;
                        default:
                            if (int.TryParse(item?.ToString(), out var parsed) && parsed > 0)
                                list.Add(parsed);
                            break;
                    }
                }

                return list.Count > 0 ? list.Distinct().ToList() : null;
            }

            return null;
        }

        public static List<CommentMentionSource> FromJsonElementArray(JsonElement commentsElem)
        {
            var list = new List<CommentMentionSource>();
            if (commentsElem.ValueKind != JsonValueKind.Array) return list;

            foreach (var el in commentsElem.EnumerateArray())
            {
                var mentioned = new List<int>();
                if (TryGetPropertyIgnoreCase(el, "mentionedUserIds", out var mEl) &&
                    mEl.ValueKind == JsonValueKind.Array)
                {
                    foreach (var idEl in mEl.EnumerateArray())
                    {
                        if (idEl.ValueKind == JsonValueKind.Number && idEl.TryGetInt32(out var id) && id > 0)
                            mentioned.Add(id);
                    }
                }

                list.Add(new CommentMentionSource
                {
                    Id = TryGetInt(el, "id"),
                    Text = TryGetString(el, "text"),
                    CreatedBy = TryGetString(el, "createdBy"),
                    MentionedUserIds = mentioned.Count > 0 ? mentioned : null
                });
            }

            return list;
        }

        /// <summary>Serialize comments for storage without mentionedUserIds.</summary>
        public static string SerializeForStorage(IEnumerable<CommentMentionSource> comments)
        {
            var payload = comments.Select(c => new
            {
                id = c.Id,
                text = c.Text ?? "",
                createdAt = (string?)null,
                createdBy = c.CreatedBy ?? ""
            }).ToList();

            // Prefer keeping createdAt if callers pass full DTOs — use typed strip instead.
            return JsonSerializer.Serialize(payload, PersistOptions);
        }

        public static string SerializeDtosForStorage<T>(IEnumerable<T> comments)
        {
            // Clear mention lists via reflection, then serialize.
            foreach (var c in comments)
            {
                if (c == null) continue;
                var mentionProp = c.GetType().GetProperty("MentionedUserIds")
                    ?? c.GetType().GetProperty("mentionedUserIds");
                if (mentionProp != null && mentionProp.CanWrite)
                    mentionProp.SetValue(c, null);
            }

            return JsonSerializer.Serialize(comments, PersistOptions);
        }

        public static string SerializeJsonElementStrippingMentions(JsonElement commentsElem)
        {
            var cleaned = new List<Dictionary<string, object?>>();
            foreach (var el in commentsElem.EnumerateArray())
            {
                var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                foreach (var prop in el.EnumerateObject())
                {
                    if (string.Equals(prop.Name, "mentionedUserIds", StringComparison.OrdinalIgnoreCase))
                        continue;
                    row[prop.Name] = JsonSerializer.Deserialize<object>(prop.Value.GetRawText());
                }
                cleaned.Add(row);
            }

            return JsonSerializer.Serialize(cleaned, PersistOptions);
        }

        private static bool TryGetPropertyIgnoreCase(JsonElement el, string name, out JsonElement value)
        {
            foreach (var prop in el.EnumerateObject())
            {
                if (string.Equals(prop.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    value = prop.Value;
                    return true;
                }
            }
            value = default;
            return false;
        }

        private static int TryGetInt(JsonElement el, string name)
        {
            if (!TryGetPropertyIgnoreCase(el, name, out var v)) return 0;
            if (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i)) return i;
            if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out var parsed)) return parsed;
            return 0;
        }

        private static string TryGetString(JsonElement el, string name)
        {
            if (!TryGetPropertyIgnoreCase(el, name, out var v)) return "";
            return v.ValueKind == JsonValueKind.String ? (v.GetString() ?? "") : v.ToString();
        }
    }
}
