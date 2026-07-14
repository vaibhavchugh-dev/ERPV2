// Test script for NCR Update functionality
const axios = require('axios');

// API is running on port 5172
const API_BASE = 'http://localhost:5172/api/Quality';

async function testNCRUpdate() {
    console.log('=== Testing NCR Update Functionality ===\n');

    try {
        // First, get an NCR to update
        console.log('1. Getting NCR data...');
        const ncrsResponse = await axios.get(`${API_BASE}/GetNCRs?tenantId=1`);
        if (!ncrsResponse.data.result || ncrsResponse.data.result.length === 0) {
            console.log('❌ No NCRs found to update');
            return;
        }

        const ncr = ncrsResponse.data.result[0];
        console.log(`✓ Found NCR: ID=${ncr.ncrId}, Title="${ncr.title}"`);

        // Prepare update data
        const updateData = {
            ...ncr,
            title: ncr.title + " (Updated)",
            description: "Updated description via API test",
            status: "Under_Investigation"
        };

        console.log('\n2. Updating NCR...');
        console.log(`   Updating title to: "${updateData.title}"`);
        console.log(`   Updating status to: "${updateData.status}"`);

        const updateResponse = await axios.put(`${API_BASE}/UpdateNCR/${ncr.ncrId}`, updateData);
        console.log('✓ Update response received:', updateResponse.data);

        if (updateResponse.data.success) {
            console.log('✓ NCR update successful!');

            // Verify the update by getting the NCR again
            console.log('\n3. Verifying update...');
            const verifyResponse = await axios.get(`${API_BASE}/GetNCR/${ncr.ncrId}?tenantId=1`);
            const updatedNcr = verifyResponse.data.result;

            if (updatedNcr.title === updateData.title && updatedNcr.status === updateData.status) {
                console.log('✓ Update verified successfully!');
                console.log(`   Title: "${updatedNcr.title}"`);
                console.log(`   Status: "${updatedNcr.status}"`);
                console.log(`   Description: "${updatedNcr.description}"`);
            } else {
                console.log('⚠️  Update verification failed');
                console.log(`   Expected title: "${updateData.title}", got: "${updatedNcr.title}"`);
                console.log(`   Expected status: "${updateData.status}", got: "${updatedNcr.status}"`);
            }
        } else {
            console.log('❌ NCR update failed');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

// Run the test
testNCRUpdate();
