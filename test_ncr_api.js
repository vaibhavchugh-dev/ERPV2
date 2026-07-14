// Test script for NCR API endpoints
const axios = require('axios');

// Try different possible API ports
const API_PORTS = [5172, 5000, 5001];

async function testAPI(baseUrl) {
    try {
        const response = await axios.get(`${baseUrl}/api/Quality/GetNCRs?tenantId=1`, { timeout: 5000 });
        return baseUrl;
    } catch (error) {
        return null;
    }
}

async function findWorkingAPI() {
    for (const port of API_PORTS) {
        const baseUrl = `http://localhost:${port}`;
        console.log(`Checking ${baseUrl}...`);
        const working = await testAPI(baseUrl);
        if (working) {
            console.log(`✓ API found at ${working}`);
            return working;
        }
    }
    return null;
}

async function testNCRAPI() {
    console.log('=== Testing NCR API Endpoints ===\n');

    // Find working API endpoint
    const API_BASE = await findWorkingAPI();
    if (!API_BASE) {
        console.log('❌ No working API server found on ports:', API_PORTS.join(', '));
        return;
    }

    try {
        // First, try to fix database null values
        console.log('0. Attempting to fix database null values...');
        try {
            const fixResponse = await axios.get(`${API_BASE}/api/Quality/FixDatabase`);
            console.log('✓ Database fix completed:', fixResponse.data.message);
        } catch (fixError) {
            console.log('⚠️  Database fix failed or not available:', fixError.response?.data?.error?.message || fixError.message);
        }
        // Test 1: Get NCRs
        console.log('1. Testing GetNCRs endpoint...');
        const ncrsResponse = await axios.get(`${API_BASE}/GetNCRs?tenantId=1`);
        console.log(`✓ Found ${ncrsResponse.data.result?.length || 0} NCRs`);
        if (ncrsResponse.data.result && ncrsResponse.data.result.length > 0) {
            console.log('   All NCRs from GetNCRs:');
            ncrsResponse.data.result.forEach(ncr => {
                console.log(`     ID=${ncr.ncrId}, Number=${ncr.ncrNumber}, Title="${ncr.title}", TenantId=${ncr.tenantId}`);
            });

            const firstNCR = ncrsResponse.data.result[0];

            // Test 2: Get NCR by ID
            console.log('\n2. Testing GetNCR by ID...');
            const ncrId = firstNCR.ncrId;
            console.log(`   Trying to get NCR with ID: ${ncrId}`);
            try {
                // Try without tenantId first
                console.log(`   Trying without tenantId filter...`);
                const ncrResponse = await axios.get(`${API_BASE}/GetNCR/${ncrId}`);
                console.log('✓ GetNCR response received');
                console.log(`   NCR Details: ID=${ncrResponse.data.result?.ncrId}, Title="${ncrResponse.data.result?.title}"`);

                // Check if all expected fields are present
                const ncr = ncrResponse.data.result;
                const expectedFields = ['ncrId', 'ncrNumber', 'title', 'description', 'category', 'severity', 'status', 'source'];
                const missingFields = expectedFields.filter(field => !(field in ncr));

                if (missingFields.length > 0) {
                    console.log(`   ⚠️  Missing fields: ${missingFields.join(', ')}`);
                } else {
                    console.log('   ✓ All expected fields present');
                }
            } catch (ncrError) {
                console.log(`❌ GetNCR failed: ${ncrError.response?.data?.error?.message || ncrError.message}`);
                // Try with tenantId=0
                try {
                    console.log(`   Trying with tenantId=0...`);
                    const ncrResponse2 = await axios.get(`${API_BASE}/GetNCR/${ncrId}?tenantId=0`);
                    console.log('✓ GetNCR with tenantId=0 succeeded');
                } catch (ncrError2) {
                    console.log(`❌ GetNCR with tenantId=0 also failed: ${ncrError2.response?.data?.error?.message || ncrError2.message}`);
                }
            }
        } else {
            console.log('   ⚠️  No NCRs found in database');
        }

        // Test 3: Get NCR Stats
        console.log('\n3. Testing GetNCRStats...');
        const statsResponse = await axios.get(`${API_BASE}/GetNCRStats?tenantId=1`);
        console.log('✓ Stats response received');
        console.log(`   Stats: ${JSON.stringify(statsResponse.data.result)}`);

        // Test 4: Debug NCRs
        console.log('\n4. Testing DebugNCRs...');
        const debugResponse = await axios.get(`${API_BASE}/DebugNCRs?tenantId=1`);
        console.log(`✓ Found ${debugResponse.data.count} NCRs in debug endpoint`);
        if (debugResponse.data.ncrs && debugResponse.data.ncrs.length > 0) {
            console.log('   Debug NCRs:');
            debugResponse.data.ncrs.forEach(ncr => {
                console.log(`     ID=${ncr.ncrId}, Number=${ncr.ncrNumber}, Title="${ncr.title}", TenantId=${ncr.tenantId}`);
            });
        }

    } catch (error) {
        console.error('❌ API Test failed:', error.response?.data || error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log('   Make sure the API server is running on http://localhost:5000');
        }
    }
}

// Run the test
testNCRAPI();
