-- Add COA column to CreditCardMaster table if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CreditCardMaster]') AND name = 'COA')
BEGIN
    ALTER TABLE [dbo].[CreditCardMaster]
    ADD [COA] nvarchar(max) NOT NULL DEFAULT '';
END

