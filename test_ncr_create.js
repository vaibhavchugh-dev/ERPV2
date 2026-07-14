// Test script for NCR creation with auto-incrementing numbers
const axios = require('axios');

const API_BASE = 'http://localhost:5172/api/Quality';

async function testNCRCreation() {
    console.log('=== Testing NCR Creation with Auto-Incrementing Numbers ===\n');

    try {
        // First, check existing NCRs to see current numbers
        console.log('1. Checking existing NCRs...');
        const ncrsResponse = await axios.get(`${API_BASE}/GetNCRs?tenantId=1`);
        console.log(`✓ Found ${ncrsResponse.data.result?.length || 0} existing NCRs`);

        if (ncrsResponse.data.result && ncrsResponse.data.result.length > 0) {
            console.log('   Existing NCR numbers:');
            ncrsResponse.data.result.forEach(ncr => {
                console.log(`     ID=${ncr.ncrId}, Number=${ncr.ncrNumber}, Title="${ncr.title}", TenantId=${ncr.tenantId || 'undefined'}`);
            });

            // Find the highest NCR number
            const maxNumber = ncrsResponse.data.result
                .map(ncr => ncr.ncrNumber)
                .filter(num => num && num.startsWith('NCR#'))
                .map(num => parseInt(num.substring(4)))
                .filter(num => !isNaN(num))
                .reduce((max, num) => Math.max(max, num), 999);

            console.log(`   Highest NCR number: NCR#${maxNumber}`);
            console.log(`   Next NCR should be: NCR#${maxNumber + 1}`);
        }

        // Create a new NCR
        console.log('\n2. Creating new NCR...');
        const newNcrData = {
            title: "Test NCR Auto-Increment",
            description: "Testing auto-incrementing NCR numbers",
            category: "Other",
            severity: "Minor",
            status: "Open",
            source: "Internal",
            tenantId: 1,
            reportedBy: 1,
            ncrNumber: null // Explicitly set to null
        };

        const createResponse = await axios.post(`${API_BASE}/CreateNCR`, newNcrData);
        console.log('✓ NCR creation response received');
        console.log('Full response:', JSON.stringify(createResponse.data, null, 2));

        if (createResponse.data.result) {
            const createdNcr = createResponse.data.result;
            console.log(`✓ NCR created successfully!`);
            console.log(`   ID: ${createdNcr.ncrId}`);
            console.log(`   Number: ${createdNcr.ncrNumber}`);
            console.log(`   Title: "${createdNcr.title}"`);

            if (createdNcr.debugInfo) {
                console.log('   Debug Info:');
                console.log(`     Calculated next number: ${createdNcr.debugInfo.calculatedNextNumber}`);
                console.log(`     Assigned NCR number: ${createdNcr.debugInfo.assignedNcrNumber}`);
            }

            // Verify the NCR was created with the correct number
            if (createdNcr.ncrNumber && createdNcr.ncrNumber.startsWith('NCR#')) {
                const numberPart = createdNcr.ncrNumber.substring(4);
                const number = parseInt(numberPart);

                if (!isNaN(number)) {
                    console.log(`✓ NCR number is valid: NCR#${number}`);

                    // Check if it was auto-incremented correctly
                    if (ncrsResponse.data.result && ncrsResponse.data.result.length > 0) {
                        const existingNumbers = ncrsResponse.data.result
                            .map(ncr => ncr.ncrNumber)
                            .filter(num => num && num.startsWith('NCR#'))
                            .map(num => parseInt(num.substring(4)))
                            .filter(num => !isNaN(num));

                        const maxExisting = Math.max(...existingNumbers);

                        if (number === maxExisting + 1) {
                            console.log(`✓ NCR number was auto-incremented correctly! (${maxExisting} -> ${number})`);
                        } else {
                            console.log(`⚠️ NCR number increment might be off. Expected ${maxExisting + 1}, got ${number}`);
                        }
                    }
                } else {
                    console.log(`❌ NCR number format is invalid: ${createdNcr.ncrNumber}`);
                }
            } else {
                console.log(`❌ NCR number is missing or invalid: ${createdNcr.ncrNumber}`);
            }
        } else {
            console.log('❌ NCR creation failed');
            console.log('Response:', createResponse.data);
        }

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

// Run the test
testNCRCreation();
