import express from 'express';
import { createConnection } from 'mysql2/promise';
import cors from 'cors';

console.log('🚀 Testing server startup...');

const app = express();
app.use(cors());
app.use(express.json());

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'sombir123',
  database: 'inventery',
};

// Test database connection first
async function testDatabase() {
  try {
    console.log('📊 Testing database connection...');
    const connection = await createConnection(dbConfig);
    console.log('✅ Database connected successfully');
    await connection.end();
    return true;
  } catch (error) {
    console.log('❌ Database connection failed:', error.message);
    console.log('⚠️  Server will still start but database operations will fail');
    return false;
  }
}

// Simple test route
app.get('/test', (req, res) => {
  res.json({ message: 'Server is working!', timestamp: new Date() });
});

// Start server
async function startServer() {
  const dbWorking = await testDatabase();
  
  const PORT = process.env.PORT || 3001;
  
  try {
    const server = app.listen(PORT, () => {
      console.log(`✅ Server started successfully on http://localhost:${PORT}`);
      console.log(`📊 Database: ${dbWorking ? '✅ Connected' : '❌ Not connected'}`);
      console.log('🧪 Test the server: http://localhost:3001/test');
      
      // Keep server running for 30 seconds for testing
      setTimeout(() => {
        console.log('⏰ Test complete - stopping server');
        server.close();
      }, 30000);
    });
    
    server.on('error', (error) => {
      console.log('❌ Server failed to start:', error.message);
      if (error.code === 'EADDRINUSE') {
        console.log('💡 Port 3001 is in use. Try a different port.');
      }
    });
    
  } catch (error) {
    console.log('❌ Failed to start server:', error.message);
  }
}

startServer();
