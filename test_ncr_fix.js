// Test script to verify NCR numbering fix
const axios = require('axios');

const API_BASE = 'http://localhost:5172/api/Quality';

async function testNCRNumberingFix() {
    console.log('=== NCR Numbering Fix Test ===\n');

    try {
        // Get current NCRs to see the current state
        console.log('1. Getting current NCRs...');
        const ncrsResponse = await axios.get(`${API_BASE}/GetNCRs?tenantId=1`);
        const ncrs = ncrsResponse.data.result;

        console.log(`Found ${ncrs.length} NCRs`);

        // Find the highest NCR number
        let maxNumber = 999;
        ncrs.forEach(ncr => {
            if (ncr.ncrNumber && ncr.ncrNumber.startsWith('NCR#')) {
                const numberPart = ncr.ncrNumber.substring(4);
                const num = parseInt(numberPart);
                if (!isNaN(num) && num > maxNumber) {
                    maxNumber = num;
                }
            }
        });

        console.log(`Current highest NCR number: NCR#${maxNumber}`);
        console.log(`Next number should be: NCR#${maxNumber + 1}\n`);

        // Create a new NCR
        console.log('2. Creating a new NCR...');
        const newNcr = {
            title: 'Test NCR Sequential Numbering',
            description: 'Testing if NCR numbers increment properly',
            category: 'Other',
            severity: 'Minor',
            status: 'Open',
            source: 'Internal',
            reportedBy: 1,
            tenantId: 1,
            defectQuantity: 1,
            totalQuantity: 10
        };

        const createResponse = await axios.post(`${API_BASE}/CreateNCR`, newNcr);
        console.log('Create NCR response:', JSON.stringify(createResponse.data, null, 2));

        if (createResponse.data.result && createResponse.data.result.ncrId) {
            const newNcrId = createResponse.data.result.ncrId;
            const assignedNumber = createResponse.data.result.ncrNumber;

            // Check debug info
            if (createResponse.data.result.debugInfo) {
                console.log('Debug Info:');
                console.log(`  calculatedNextNumber: ${createResponse.data.result.debugInfo.calculatedNextNumber}`);
                console.log(`  assignedNcrNumber: ${createResponse.data.result.debugInfo.assignedNcrNumber}`);
                console.log(`  finalNcrNumber: ${createResponse.data.result.debugInfo.finalNcrNumber}`);
            }

            console.log(`\n✅ New NCR created with ID: ${newNcrId}`);
            console.log(`Assigned NCR Number: ${assignedNumber}`);

            // Verify the number is correct
            const expectedNumber = `NCR#${maxNumber + 1}`;
            if (assignedNumber === expectedNumber) {
                console.log(`✅ SUCCESS: NCR number incremented correctly!`);
                console.log(`Expected: ${expectedNumber}, Got: ${assignedNumber}`);
            } else {
                console.log(`❌ FAILURE: NCR number not incremented correctly!`);
                console.log(`Expected: ${expectedNumber}, Got: ${assignedNumber}`);
            }

            // Get the NCR back to verify it was saved correctly
            console.log('\n3. Verifying NCR was saved correctly...');
            const getResponse = await axios.get(`${API_BASE}/GetNCR/${newNcrId}?tenantId=1`);
            const retrievedNcr = getResponse.data.result;

            console.log(`Retrieved NCR Number: ${retrievedNcr.ncrNumber}`);
            console.log(`Retrieved NCR Title: "${retrievedNcr.title}"`);

            if (retrievedNcr.ncrNumber === expectedNumber) {
                console.log('✅ SUCCESS: NCR number persisted correctly in database!');
            } else {
                console.log('❌ FAILURE: NCR number was changed in database!');
                console.log('This suggests a database trigger/constraint is still active.');
            }

        } else {
            console.log('❌ FAILED to create NCR');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

// Run the test
testNCRNumberingFix();
