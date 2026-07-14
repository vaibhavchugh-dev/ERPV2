const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:5172'; // API server runs on port 5172
const TENANT_ID = 1; // Adjust based on your tenant setup

// Test data
const testVendorInvoice = {
    VendorId: 1,
    VendorCode: "VEND001",
    VendorName: "Test Vendor Inc.",
    LocationId: 1,
    InvoiceDate: "2024-01-15",
    DueDate: "2024-02-15",
    Notes: "Test vendor invoice for API testing",
    LineItems: [
        {
            VendorOrderId: 1,
            VendorOrderDetailId: 1,
            AccountId: 1001,
            Description: "Test Item 1",
            Amount: 1000.00,
            Quantity: 10,
            UnitPrice: 100.00,
            VendorPoNumber: "PO001",
            OrderDate: "2024-01-10"
        },
        {
            VendorOrderId: 1,
            VendorOrderDetailId: 2,
            AccountId: 1002,
            Description: "Test Item 2",
            Amount: 500.00,
            Quantity: 5,
            UnitPrice: 100.00,
            VendorPoNumber: "PO001",
            OrderDate: "2024-01-10"
        }
    ]
};

// Test functions
async function testGetVendorInvoices() {
    console.log('\n=== Testing GetVendorInvoices ===');
    try {
        const response = await axios.get(`${BASE_URL}/api/VendorInvoice/GetVendorInvoices?tenantid=${TENANT_ID}`);
        console.log('✅ GetVendorInvoices successful');
        console.log(`Found ${response.data.result.length} vendor invoices`);
        return response.data.result;
    } catch (error) {
        console.error('❌ GetVendorInvoices failed:', error.response?.data || error.message);
        return [];
    }
}

async function testCreateVendorInvoice() {
    console.log('\n=== Testing CreateVendorInvoice ===');
    try {
        const response = await axios.post(`${BASE_URL}/api/VendorInvoice/CreateVendorInvoice`, testVendorInvoice);
        console.log('✅ CreateVendorInvoice successful');
        console.log('Created invoice:', response.data.result);
        return response.data.result.invoiceId;
    } catch (error) {
        console.error('❌ CreateVendorInvoice failed:', error.response?.data || error.message);
        return null;
    }
}

async function testGetVendorInvoiceById(invoiceId) {
    console.log(`\n=== Testing GetVendorInvoiceById (${invoiceId}) ===`);
    try {
        const response = await axios.get(`${BASE_URL}/api/VendorInvoice/GetVendorInvoiceById/${invoiceId}`);
        console.log('✅ GetVendorInvoiceById successful');
        console.log('Invoice details:', {
            id: response.data.result.id,
            invoiceNo: response.data.result.invoiceNo,
            vendorName: response.data.result.vendorName,
            amount: response.data.result.amount,
            status: response.data.result.status
        });
        return response.data.result;
    } catch (error) {
        console.error('❌ GetVendorInvoiceById failed:', error.response?.data || error.message);
        return null;
    }
}

async function testApproveVendorInvoice(invoiceId) {
    console.log(`\n=== Testing ApproveVendorInvoice (${invoiceId}) ===`);
    try {
        const response = await axios.post(`${BASE_URL}/api/VendorInvoice/ApproveVendorInvoice/${invoiceId}`);
        console.log('✅ ApproveVendorInvoice successful');
        console.log('Approval result:', response.data.result);
        return true;
    } catch (error) {
        console.error('❌ ApproveVendorInvoice failed:', error.response?.data || error.message);
        return false;
    }
}

async function testRecordVendorPayment(invoiceId) {
    console.log(`\n=== Testing RecordVendorPayment (${invoiceId}) ===`);
    try {
        const paymentData = {
            PaymentMethod: "Check",
            PaymentDate: new Date().toISOString().split('T')[0],
            CheckNo: "CHK001",
            CheckDate: new Date().toISOString().split('T')[0],
            PvrNo: 1001,
            Series: "AP",
            BankId: 1
        };

        const response = await axios.post(`${BASE_URL}/api/VendorInvoice/RecordVendorPayment/${invoiceId}`, paymentData);
        console.log('✅ RecordVendorPayment successful');
        console.log('Payment result:', response.data.result);
        return true;
    } catch (error) {
        console.error('❌ RecordVendorPayment failed:', error.response?.data || error.message);
        return false;
    }
}

async function testUpdateVendorInvoice(invoiceId) {
    console.log(`\n=== Testing UpdateVendorInvoice (${invoiceId}) ===`);
    try {
        const updateData = {
            InvoiceDate: "2024-01-16",
            DueDate: "2024-02-16",
            Notes: "Updated test vendor invoice",
            LocationId: 1,
            LineItems: [
                {
                    VendorOrderId: 1,
                    VendorOrderDetailId: 1,
                    AccountId: 1001,
                    Description: "Updated Test Item 1",
                    Amount: 1200.00,
                    Quantity: 12,
                    UnitPrice: 100.00,
                    VendorPoNumber: "PO001",
                    OrderDate: "2024-01-10"
                }
            ]
        };

        const response = await axios.put(`${BASE_URL}/api/VendorInvoice/UpdateVendorInvoice/${invoiceId}`, updateData);
        console.log('✅ UpdateVendorInvoice successful');
        console.log('Update result:', response.data.result);
        return true;
    } catch (error) {
        console.error('❌ UpdateVendorInvoice failed:', error.response?.data || error.message);
        return false;
    }
}

async function testDeleteVendorInvoice(invoiceId) {
    console.log(`\n=== Testing DeleteVendorInvoice (${invoiceId}) ===`);
    try {
        const response = await axios.delete(`${BASE_URL}/api/VendorInvoice/DeleteVendorInvoice/${invoiceId}`);
        console.log('✅ DeleteVendorInvoice successful');
        console.log('Delete result:', response.data.result);
        return true;
    } catch (error) {
        console.error('❌ DeleteVendorInvoice failed:', error.response?.data || error.message);
        return false;
    }
}

// Main test execution
async function runTests() {
    console.log('🚀 Starting Vendor Invoice API Tests');
    console.log('=====================================');

    try {
        // Test 1: Get existing invoices
        const existingInvoices = await testGetVendorInvoices();

        // Test 2: Create new invoice
        const newInvoiceId = await testCreateVendorInvoice();
        if (!newInvoiceId) {
            console.log('❌ Cannot continue tests without invoice ID');
            return;
        }

        // Test 3: Get invoice details
        await testGetVendorInvoiceById(newInvoiceId);

        // Test 4: Approve invoice
        await testApproveVendorInvoice(newInvoiceId);

        // Test 5: Record payment
        await testRecordVendorPayment(newInvoiceId);

        // Test 6: Update invoice
        await testUpdateVendorInvoice(newInvoiceId);

        // Test 7: Get updated invoice list
        await testGetVendorInvoices();

        // Test 8: Delete invoice (commented out to preserve test data)
        // await testDeleteVendorInvoice(newInvoiceId);

        console.log('\n🎉 All Vendor Invoice API tests completed!');
        console.log('=====================================');

    } catch (error) {
        console.error('💥 Test execution failed:', error.message);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests();
}

module.exports = {
    testGetVendorInvoices,
    testCreateVendorInvoice,
    testGetVendorInvoiceById,
    testApproveVendorInvoice,
    testRecordVendorPayment,
    testUpdateVendorInvoice,
    testDeleteVendorInvoice,
    runTests
};
