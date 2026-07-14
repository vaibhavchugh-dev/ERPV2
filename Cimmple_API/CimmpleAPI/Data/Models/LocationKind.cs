namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// Stored in <see cref="Location.LocType"/>. Single table hierarchy: business sites are roots;
    /// warehouses, zones, shelves, and bins are children with increasing type order.
    /// </summary>
    public static class LocationKind
    {
        public const int BusinessSite = 1;
        public const int Warehouse = 2;
        public const int Zone = 3;
        public const int Shelf = 4;
        public const int Bin = 5;

        public static string GetDisplayName(int locType) => locType switch
        {
            BusinessSite => "Business site",
            Warehouse => "Warehouse / storeroom",
            Zone => "Zone / rack / aisle",
            Shelf => "Shelf / level",
            Bin => "Bin / slot",
            _ => "Location"
        };

        public static bool IsValid(int locType) => locType >= BusinessSite && locType <= Bin;

        /// <summary>Root rows must be business sites. Children must have a strictly greater type than their parent.</summary>
        public static bool IsValidParentChild(int? parentLocType, int childLocType)
        {
            if (!IsValid(childLocType)) return false;
            if (parentLocType == null) return childLocType == BusinessSite;
            if (!IsValid(parentLocType.Value)) return false;
            return childLocType > parentLocType.Value;
        }
    }
}
