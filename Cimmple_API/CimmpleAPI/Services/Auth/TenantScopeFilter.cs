using System.Collections;
using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace CimmpleAPI.Services.Auth
{
    /// <summary>
    /// Pins every signed-in request to the tenant in its access token. Tenant ids sent by the
    /// client (query string, route, bound parameters, body DTOs at any depth, raw JSON bodies and
    /// form fields) are filled with the token tenant when 0 or missing, and rejected with 403 when
    /// they name a different tenant. Tokens without a tenant (support staff) are rejected unless
    /// the endpoint opts in with <see cref="AllowTenantlessCallerAttribute"/>.
    /// </summary>
    public sealed class TenantScopeFilter : IAsyncActionFilter
    {
        private const int MaxDepth = 6;
        private const int MaxFormJsonLength = 1_000_000;

        private static readonly Assembly AppAssembly = typeof(TenantScopeFilter).Assembly;
        private static readonly ConcurrentDictionary<Type, TypeShape> Shapes = new();

        public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            var metadata = context.ActionDescriptor.EndpointMetadata;
            var user = context.HttpContext.User;
            if (metadata.Any(m => m is AllowAnonymousAttribute or SkipTenantScopeAttribute)
                || user?.Identity?.IsAuthenticated != true)
            {
                await next();
                return;
            }

            var tokenTenant = int.TryParse(user.FindFirst("tenantId")?.Value, out var t) && t > 0 ? t : 0;
            if (tokenTenant == 0 && !metadata.Any(m => m is AllowTenantlessCallerAttribute))
            {
                Deny(context, tokenTenant, "token has no tenant");
                return;
            }

            var scope = new Scope(tokenTenant);

            if (!CheckQueryAndRoute(context, scope)
                || !CheckActionArguments(context, scope)
                || !await CheckFormAsync(context, scope))
            {
                Deny(context, tokenTenant, scope.MismatchSource ?? "request");
                return;
            }

            await next();
        }

        private static bool CheckQueryAndRoute(ActionExecutingContext context, Scope scope)
        {
            foreach (var (key, values) in context.HttpContext.Request.Query)
            {
                if (!IsTenantName(key)) continue;
                foreach (var value in values)
                {
                    if (!scope.Accept(value, $"query '{key}'")) return false;
                }
            }

            foreach (var (key, value) in context.RouteData.Values)
            {
                if (IsTenantName(key) && !scope.Accept(value, $"route '{key}'")) return false;
            }

            return true;
        }

        private static bool CheckActionArguments(ActionExecutingContext context, Scope scope)
        {
            foreach (var parameter in context.ActionDescriptor.Parameters)
            {
                var name = parameter.Name;
                context.ActionArguments.TryGetValue(name, out var value);

                if (IsTenantName(name) && TryConvertTenant(scope.TokenTenant, parameter.ParameterType, out var pinned))
                {
                    if (!scope.Accept(value, $"parameter '{name}'")) return false;
                    if (scope.TokenTenant > 0) context.ActionArguments[name] = pinned;
                    continue;
                }

                if (value is JsonElement json)
                {
                    if (!TryPinJson(json, scope, $"body '{name}'", out var rewritten)) return false;
                    context.ActionArguments[name] = rewritten;
                    continue;
                }

                if (value != null && !Walk(value, scope, 0, new HashSet<object>(ReferenceEqualityComparer.Instance)))
                {
                    return false;
                }
            }

            return true;
        }

        private static async Task<bool> CheckFormAsync(ActionExecutingContext context, Scope scope)
        {
            var request = context.HttpContext.Request;
            if (!request.HasFormContentType) return true;

            IFormCollection form;
            try
            {
                form = await request.ReadFormAsync();
            }
            catch (InvalidDataException)
            {
                return true;
            }

            foreach (var (key, values) in form)
            {
                foreach (var value in values)
                {
                    if (IsTenantName(key))
                    {
                        if (!scope.Accept(value, $"form '{key}'")) return false;
                        continue;
                    }

                    // Upload endpoints carry their context as a JSON string field (e.g. "formField").
                    if (string.IsNullOrEmpty(value) || value.Length > MaxFormJsonLength) continue;
                    var trimmed = value.TrimStart();
                    if (!trimmed.StartsWith('{') && !trimmed.StartsWith('[')) continue;

                    JsonNode? node;
                    try
                    {
                        node = JsonNode.Parse(value);
                    }
                    catch (JsonException)
                    {
                        continue;
                    }

                    if (!PinJsonNode(node, scope, $"form '{key}'", 0)) return false;
                }
            }

            return true;
        }

        private static bool Walk(object value, Scope scope, int depth, HashSet<object> visited)
        {
            if (depth > MaxDepth) return true;

            var type = value.GetType();
            if (type.IsPrimitive || type.IsEnum || value is string or decimal or DateTime or DateTimeOffset
                or Guid or TimeSpan or IFormFile or Stream or IDictionary)
            {
                return true;
            }

            if (value is IEnumerable items)
            {
                foreach (var item in items)
                {
                    if (item != null && !Walk(item, scope, depth + 1, visited)) return false;
                }

                return true;
            }

            if (type.Assembly != AppAssembly || !visited.Add(value)) return true;

            var shape = Shapes.GetOrAdd(type, BuildShape);

            foreach (var property in shape.TenantProperties)
            {
                var current = SafeGet(property, value);
                if (!scope.Accept(current, $"{type.Name}.{property.Name}")) return false;
                if (scope.TokenTenant > 0
                    && property.CanWrite
                    && TryConvertTenant(scope.TokenTenant, property.PropertyType, out var pinned))
                {
                    property.SetValue(value, pinned);
                }
            }

            foreach (var property in shape.NestedProperties)
            {
                var child = SafeGet(property, value);
                if (child is JsonElement json)
                {
                    if (!TryPinJson(json, scope, $"{type.Name}.{property.Name}", out var rewritten)) return false;
                    if (property.CanWrite) property.SetValue(value, rewritten);
                    continue;
                }

                if (child != null && !Walk(child, scope, depth + 1, visited)) return false;
            }

            return true;
        }

        private static bool TryPinJson(JsonElement json, Scope scope, string source, out JsonElement rewritten)
        {
            rewritten = json;
            if (json.ValueKind is not (JsonValueKind.Object or JsonValueKind.Array)) return true;

            var node = JsonNode.Parse(json.GetRawText());
            if (!PinJsonNode(node, scope, source, 0)) return false;

            if (scope.TokenTenant > 0)
            {
                rewritten = JsonSerializer.SerializeToElement(node);
            }

            return true;
        }

        private static bool PinJsonNode(JsonNode? node, Scope scope, string source, int depth)
        {
            if (node == null || depth > MaxDepth + 2) return true;

            if (node is JsonArray array)
            {
                foreach (var item in array)
                {
                    if (!PinJsonNode(item, scope, source, depth + 1)) return false;
                }

                return true;
            }

            if (node is not JsonObject obj) return true;

            foreach (var (key, child) in obj.ToList())
            {
                if (IsTenantName(key) && child is null or JsonValue)
                {
                    var asValue = child as JsonValue;
                    object? raw = null;
                    var wasString = false;
                    if (asValue != null)
                    {
                        if (asValue.TryGetValue<long>(out var number)) raw = number;
                        else if (asValue.TryGetValue<string>(out var text))
                        {
                            raw = text;
                            wasString = true;
                        }
                    }

                    if (!scope.Accept(raw, $"{source} '{key}'")) return false;
                    if (scope.TokenTenant > 0)
                    {
                        obj[key] = wasString
                            ? JsonValue.Create(scope.TokenTenant.ToString())
                            : JsonValue.Create(scope.TokenTenant);
                    }

                    continue;
                }

                if (!PinJsonNode(child, scope, source, depth + 1)) return false;
            }

            return true;
        }

        private static object? SafeGet(PropertyInfo property, object target)
        {
            try
            {
                return property.GetValue(target);
            }
            catch
            {
                return null;
            }
        }

        private static TypeShape BuildShape(Type type)
        {
            var tenant = new List<PropertyInfo>();
            var nested = new List<PropertyInfo>();

            foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                if (!property.CanRead || property.GetIndexParameters().Length > 0) continue;

                var propertyType = property.PropertyType;
                if (IsTenantName(property.Name) && IsTenantScalar(propertyType))
                {
                    tenant.Add(property);
                    continue;
                }

                var underlying = Nullable.GetUnderlyingType(propertyType) ?? propertyType;
                if (underlying == typeof(JsonElement)
                    || (!underlying.IsValueType && underlying != typeof(string)))
                {
                    nested.Add(property);
                }
            }

            return new TypeShape(tenant.ToArray(), nested.ToArray());
        }

        private static bool IsTenantName(string? name)
        {
            if (string.IsNullOrEmpty(name)) return false;
            return string.Equals(name.Replace("_", ""), "tenantid", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsTenantScalar(Type type)
        {
            var underlying = Nullable.GetUnderlyingType(type) ?? type;
            return underlying == typeof(int) || underlying == typeof(long) || underlying == typeof(string);
        }

        private static bool TryConvertTenant(int tenantId, Type target, out object? converted)
        {
            var underlying = Nullable.GetUnderlyingType(target) ?? target;
            if (underlying == typeof(int)) { converted = tenantId; return true; }
            if (underlying == typeof(long)) { converted = (long)tenantId; return true; }
            if (underlying == typeof(string)) { converted = tenantId.ToString(); return true; }
            converted = null;
            return false;
        }

        private static void Deny(ActionExecutingContext context, int tokenTenant, string source)
        {
            var logger = context.HttpContext.RequestServices.GetService<ILogger<TenantScopeFilter>>();
            logger?.LogWarning(
                "Tenant scope violation: {Method} {Path} token tenant {TokenTenant}, user {UserId}, source {Source}",
                context.HttpContext.Request.Method,
                context.HttpContext.Request.Path.Value,
                tokenTenant,
                context.HttpContext.User.FindFirst("userId")?.Value,
                source);

            context.Result = new ObjectResult(new { message = "Access denied" })
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
        }

        private sealed record TypeShape(PropertyInfo[] TenantProperties, PropertyInfo[] NestedProperties);

        private sealed class Scope
        {
            public Scope(int tokenTenant) => TokenTenant = tokenTenant;

            public int TokenTenant { get; }
            public string? MismatchSource { get; private set; }

            /// <summary>0, blank or unparseable values are accepted (they get pinned); anything else must equal the token tenant.</summary>
            public bool Accept(object? value, string source)
            {
                long requested = value switch
                {
                    null => 0,
                    int i => i,
                    long l => l,
                    short s => s,
                    string text => long.TryParse(text.Trim(), out var parsed) ? parsed : 0,
                    _ => long.TryParse(value.ToString(), out var parsed) ? parsed : 0
                };

                if (requested <= 0 || requested == TokenTenant) return true;

                MismatchSource = source;
                return false;
            }
        }
    }
}
