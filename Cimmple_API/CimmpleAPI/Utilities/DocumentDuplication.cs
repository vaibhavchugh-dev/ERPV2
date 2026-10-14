using System;

namespace CimmpleAPI.Utilities
{
    /// <summary>Shared rules for the Duplicate action on quotations and orders.</summary>
    public static class DocumentDuplication
    {
        /// <summary>
        /// Moves a due date so it keeps the same lead time relative to the new document date.
        /// Unset dates, or dates before the source document date, become the new document date.
        /// </summary>
        public static DateTime ShiftDueDate(DateTime sourceDueDate, DateTime sourceDocumentDate, DateTime newDocumentDate)
        {
            var leadDays = (sourceDueDate.Date - sourceDocumentDate.Date).Days;
            return leadDays > 0 ? newDocumentDate.Date.AddDays(leadDays) : newDocumentDate.Date;
        }
    }
}
