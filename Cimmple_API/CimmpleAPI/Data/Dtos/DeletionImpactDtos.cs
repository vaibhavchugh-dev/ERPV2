using System.Collections.Generic;

namespace CimmpleAPI.Data.Dtos
{
    public class DeletionImpactResult
    {
        public bool CanDelete { get; set; }
        public List<string> BlockingReasons { get; set; } = new List<string>();
        public List<BlockingDependency> BlockingDependencies { get; set; } = new List<BlockingDependency>();
        public List<ImpactedEntity> WillBeDeleted { get; set; } = new List<ImpactedEntity>();
        public List<ImpactedEntity> WillBeAffected { get; set; } = new List<ImpactedEntity>();
        public List<string> Warnings { get; set; } = new List<string>();
    }

    public class ImpactedEntity
    {
        public string EntityType { get; set; }
        public int Count { get; set; }
        public string Description { get; set; }
        public List<int>? RelatedIds { get; set; }
    }

    public class BlockingDependency
    {
        public string EntityType { get; set; } // "Invoice", "Shipment", "JobOrder"
        public string Description { get; set; }
        public List<DependencyItem> Items { get; set; } = new List<DependencyItem>();
    }

    public class DependencyItem
    {
        public int Id { get; set; }
        public string Name { get; set; } // Invoice number, Shipment number, etc.
        public string DeleteEndpoint { get; set; } // API endpoint to delete this item
    }
}

