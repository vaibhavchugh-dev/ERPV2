-- Add AttachmentsJson and CommentsJson columns to QuotationOrder table
ALTER TABLE QuotationOrder
ADD AttachmentsJson NVARCHAR(MAX) NULL;

ALTER TABLE QuotationOrder
ADD CommentsJson NVARCHAR(MAX) NULL;



