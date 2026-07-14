using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class jobMaster
    {
        [Key]
        public int jobid { get; set; }
        public int orderid { get; set; }
        public string? jobNo { get; set; }
        public int partid { get; set; }
        public int createdby { get; set; }
        public int tenantid { get; set; }
        public int jobassignedId { get; set; }
        public int? processid { get; set; }
        public int? ReworkCount { get; set; }
        public string? TrackerStatus { get; set; }
        public string? DrawingNo { get; set; }
        public string? DrawingRevision { get; set; }
        public bool? ManualTracking { get; set; }
    }

    public class jobdetails
    {
        [Key]
        public int id { get; set; }
        public int jobid { get; set; }
        public int ProcessOrder { get; set; }
        public int processid { get; set; }
        public string? processname { get; set; }
        public string? type { get; set; }
        public string? jdescription { get; set; }
        public int? assignedid { get; set; }
        public int? workstationid { get; set; }
        public int? qty { get; set; }
        public int tenantid { get; set; }
        public string? AssignedComment { get; set; }
    }

    public class jobdetailstatus
    {
        [Key]
        public int id { get; set; }
        public int jobdetailid { get; set; }
        public int assigntoid { get; set; }
        public DateTime? startdate { get; set; }
        public DateTime? enddate { get; set; }
        public string? status { get; set; }
    }

    public class JobTracker
    {
        [Key]
        public int id { get; set; }
        public int jobid { get; set; }
        public int processid { get; set; }
        public int assignedid { get; set; }
        public string? startdate { get; set; }
        public string? holdtime { get; set; }
        public string? enddatetime { get; set; }
        public int tenantid { get; set; }
        public string? status { get; set; }
        public string? Explanation { get; set; }
        public string? qtyComment { get; set; }
        public int? JobNCRId { get; set; }
        public int? completeqty { get; set; }
        public int? qty { get; set; }
        public int? NCRQty { get; set; }
        public int? userid { get; set; }
        public bool? IsCreatedFromNCR { get; set; }
        public bool? isNCR { get; set; }
        public int? jobdetailsid { get; set; }
    }

    public class JobNCR
    {
        [Key]
        public int Id { get; set; }
        public string? Description { get; set; }
        public string? RCA { get; set; }
        public string? PlannedAction { get; set; }
        public int TenantId { get; set; }
        public int locationId { get; set; }
        public int? JobId { get; set; }
        public string? TypeOfNCR { get; set; }
        public string? NCRCode { get; set; }
        public string? NCRNo { get; set; }
        public int? CreatedBy { get; set; }
        public DateTime? CreatedOn { get; set; }
        public int? InvestigatedBy { get; set; }
        public DateTime? InvestigatedOn { get; set; }
        public int? DispositionBy { get; set; }
        public DateTime? DispositionOn { get; set; }
        public DateTime? ReportedOn { get; set; }
        public int? vendorOrderId { get; set; }
    }

    public class JobAttachment
    {
        [Key]
        public int Id { get; set; }
        public int jobid { get; set; }
        public string? Name { get; set; }
        public int size { get; set; }
        public int FileUniqueno { get; set; }
        public string? UploadFile { get; set; }
        public int TenantID { get; set; }
        public string? FileCode { get; set; }
        public string? Pageno { get; set; }
        public int createdby { get; set; }
    }
}







