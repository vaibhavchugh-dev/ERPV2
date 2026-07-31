using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    public class ProcessMaster
    {
        [Key]
        public int Id { get; set; }

        [MaxLength(50)]
        public string? ProcessCode { get; set; }

        [MaxLength(200)]
        public string? ProcessName { get; set; }

        public int Srno { get; set; }

        public string? PDescription { get; set; }

        public int Tenantid { get; set; }

        /// <summary>
        /// Outside Services flag (1 = Yes). Classification only, does not restrict deletion.
        /// </summary>
        public int? isFixed { get; set; }

        /// <summary>
        /// Protected process seeded by the system. Cannot be deleted by users.
        /// </summary>
        public bool IsSystem { get; set; }

        public int status { get; set; }

        [MaxLength(50)]
        public string? ledgercode { get; set; }

        [MaxLength(50)]
        public string? ProcessCategory { get; set; }

        /// <summary>
        /// Default estimated run time in minutes for Job Order routing steps.
        /// </summary>
        public int? DefaultEstimatedTimeMinutes { get; set; }

        public int? DefaultWorkstationId { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal? StandardCostPerHour { get; set; }
    }
}
