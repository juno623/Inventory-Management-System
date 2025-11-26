import { createConnection } from 'mysql2/promise';
import express from 'express';
import net from 'net';

console.log('🔍 Backend Diagnostic Tool');
console.log('========================\n');

// Test 1: Check if port 5000 is available
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    server.on('error', () => resolve(false));
  });
}

// Test 2: Test MySQL connection
async function testMySQL() {
  const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'sombir123',
    database: 'inventery',
  };

  try {
    console.log('2️⃣ Testing MySQL connection...');
    const connection = await createConnection(dbConfig);
    console.log('   ✅ MySQL connection successful');
    await connection.end();
    return true;
  } catch (error) {
    console.log('   ❌ MySQL connection failed');
    console.log(`   Error: ${error.code} - ${error.message}`);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('   💡 Solution: Start MySQL server');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('   💡 Solution: Check MySQL username/password');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('   💡 Solution: Create database "inventery"');
    }
    return false;
  }
}

// Test 3: Test Express server startup
async function testExpress() {
  try {
    console.log('3️⃣ Testing Express server...');
    const app = express();
    const server = app.listen(5001, () => {
      console.log('   ✅ Express server can start');
      server.close();
    });
    return true;
  } catch (error) {
    console.log('   ❌ Express server failed');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

// Run all tests
async function runDiagnostics() {
  // Test 1: Port availability
  console.log('1️⃣ Checking port 5000...');
  const portAvailable = await checkPort(5000);
  if (portAvailable) {
    console.log('   ✅ Port 5000 is available');
  } else {
    console.log('   ❌ Port 5000 is already in use');
    console.log('   💡 Solution: Kill process using port 5000 or use different port');
  }

  // Test 2: MySQL
  const mysqlWorking = await testMySQL();

  // Test 3: Express
  const expressWorking = await testExpress();

  console.log('\n📋 Summary:');
  console.log(`Port 5000: ${portAvailable ? '✅' : '❌'}`);
  console.log(`MySQL: ${mysqlWorking ? '✅' : '❌'}`);
  console.log(`Express: ${expressWorking ? '✅' : '❌'}`);

  if (portAvailable && mysqlWorking && expressWorking) {
    console.log('\n🎉 All tests passed! Your server should work.');
    console.log('Try running: npm start');
  } else {
    console.log('\n⚠️  Fix the issues above before starting your server.');
  }
}

runDiagnostics().catch(console.error);
