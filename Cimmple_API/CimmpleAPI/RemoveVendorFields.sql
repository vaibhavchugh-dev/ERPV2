-- Migration script to remove purchasing_agent and Pointofcontact columns from VendorMaster table
-- Run this script against your database to drop these columns

ALTER TABLE [VendorMaster] DROP COLUMN [Pointofcontact];
ALTER TABLE [VendorMaster] DROP COLUMN [purchasing_agent];



