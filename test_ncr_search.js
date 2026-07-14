// Test script to demonstrate NCR search problem
const axios = require('axios');

const API_BASE = 'http://localhost:5172/api/Quality';

async function testNCRSearchProblem() {
    console.log('=== NCR Search Problem Demonstration ===\n');

    try {
        // Get all NCRs
        console.log('1. Getting all NCRs...');
        const ncrsResponse = await axios.get(`${API_BASE}/GetNCRs?tenantId=1`);
        const ncrs = ncrsResponse.data.result;

        console.log(`Found ${ncrs.length} NCRs`);
        console.log('\nNCR Numbers:');
        ncrs.forEach(ncr => {
            console.log(`  ID: ${ncr.ncrId}, Number: ${ncr.ncrNumber}, Title: "${ncr.title}"`);
        });

        // Try to find a specific NCR by number
        console.log('\n2. Trying to find NCR with number "NCR#1000"...');
        const matchingNcrs = ncrs.filter(ncr => ncr.ncrNumber === 'NCR#1000');
        console.log(`Found ${matchingNcrs.length} NCRs with number "NCR#1000"`);

        if (matchingNcrs.length > 1) {
            console.log('\n❌ PROBLEM: Multiple NCRs have the same number!');
            console.log('Users cannot uniquely identify NCRs by their business number.');
            console.log('\nAffected NCRs:');
            matchingNcrs.forEach(ncr => {
                console.log(`  - NCR ID ${ncr.ncrId}: "${ncr.title}"`);
            });
        }

        // Demonstrate the difference with Order numbering
        console.log('\n3. Comparing with Order numbering (how it SHOULD work)...');
        console.log('Customer/Vendor Orders have:');
        console.log('  - OrderID: Auto-incrementing primary key (1, 2, 3, ...)');
        console.log('  - PONumber: Business number (1000, 1001, 1002, ...)');
        console.log('  - Users search by PONumber, not OrderID');

        console.log('\nNCRs currently have:');
        console.log('  - NcrId: Auto-incrementing primary key (works fine)');
        console.log('  - NcrNumber: Always "NCR#1000" (BROKEN)');
        console.log('  - Users cannot search by NcrNumber!');

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

// Run the test
testNCRSearchProblem();



















