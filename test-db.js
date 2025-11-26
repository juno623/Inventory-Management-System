import { createConnection } from 'mysql2/promise';

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'sombir123',
  database: 'inventery',
};

async function testConnection() {
  try {
    console.log('Testing MySQL connection...');
    const connection = await createConnection(dbConfig);
    console.log('✅ Successfully connected to MySQL database');
    await connection.end();
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n🔧 Possible solutions:');
      console.log('1. Make sure MySQL server is running');
      console.log('2. Check if MySQL is installed');
      console.log('3. Verify MySQL is running on port 3306');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n🔧 Possible solutions:');
      console.log('1. Check username and password');
      console.log('2. Make sure user has proper permissions');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('\n🔧 Possible solutions:');
      console.log('1. Create the "inventery" database');
      console.log('2. Check database name spelling');
    }
  }
}

testConnection();
