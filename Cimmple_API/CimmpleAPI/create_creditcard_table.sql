IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CreditCardMaster]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CreditCardMaster] (
        [Id] int IDENTITY(1,1) NOT NULL,
        [CardNumber] nvarchar(max) NOT NULL,
        [LastFourDigits] nvarchar(max) NOT NULL,
        [CardholderName] nvarchar(max) NOT NULL,
        [CardType] nvarchar(max) NOT NULL,
        [ExpiryMonth] nvarchar(max) NOT NULL,
        [ExpiryYear] nvarchar(max) NOT NULL,
        [CVV] nvarchar(max) NOT NULL,
        [BillingStreet] nvarchar(max) NOT NULL,
        [BillingApartment] nvarchar(max) NOT NULL,
        [BillingCity] nvarchar(max) NOT NULL,
        [BillingState] nvarchar(max) NOT NULL,
        [BillingZip] nvarchar(max) NOT NULL,
        [BillingCountry] nvarchar(max) NOT NULL,
        [Phone] nvarchar(max) NOT NULL,
        [Email] nvarchar(max) NOT NULL,
        [Status] int NOT NULL,
        [TenantId] int NOT NULL,
        [NickName] nvarchar(max) NOT NULL,
        [IsPrimary] bit NULL,
        [COA] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_CreditCardMaster] PRIMARY KEY ([Id])
    );
END

