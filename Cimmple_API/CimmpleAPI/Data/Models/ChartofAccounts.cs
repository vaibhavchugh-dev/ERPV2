using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class ChartofAccounts
    {
        [Key]
        public int AccountID { get; set; }
        public string AccountCode { get; set; }
        public string AccountName { get; set; }
        public string AccountType { get; set; }
        public bool IsActive { get; set; }
        public int? Groupid { get; set; }
        public int? Subgroupid { get; set; }
        public int? Subgroupid2 { get; set; }
        public int? Subgroupid3 { get; set; }
        public int? Linegroupid { get; set; }
        public int Tenantid { get; set; }
        public string MainGroup { get; set; }
    }

    public class MainGroup
    {
        [Key]
        public int Autoid { get; set; }
        public int MainGroupID { get; set; }
        public string MainGroupName { get; set; }
        public int accountId { get; set; }
        public int tenantid { get; set; }
    }

    public class SubGroup
    {
        [Key]
        public int Autoid { get; set; }
        public int SubGroupID { get; set; }
        public int? MainGroupID { get; set; }
        public string SubGroupName { get; set; }
        public int tenantid { get; set; }
    }

    public class SubGroup2
    {
        [Key]
        public int Autoid { get; set; }
        public int SubGroup2ID { get; set; }
        public int? SubGroupID { get; set; }
        public string SubGroup2Name { get; set; }
        public int tenantid { get; set; }
    }

    public class SubGroup3
    {
        [Key]
        public int SubGroup3ID { get; set; }
        public int? SubGroup2ID { get; set; }
        public string SubGroup3Name { get; set; }
        public int tenantid { get; set; }
    }

    public class COARowtitle
    {
        [Key]
        public int id { get; set; }
        public int SubGroupID { get; set; }
        public string name { get; set; }
        public int tenantid { get; set; }
    }
}







