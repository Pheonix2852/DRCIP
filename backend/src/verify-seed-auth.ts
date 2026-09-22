import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function verifyAuth() {
  const email = process.env.ADMIN_EMAIL || 'admin@drcip.local';
  const password = process.env.ADMIN_PASSWORD || 'Rintupiku123!';
  const url = 'http://localhost:5000/api/v1/auth/login';

  console.log(`🧪 Attempting login for ${email} at ${url}...`);

  try {
    const response = await axios.post(url, { email, password });
    
    if (response.data.success) {
      console.log('✅ Authentication successful!');
      console.log('👤 User:', response.data.data.user);
      console.log('🔑 Token received (truncated):', response.data.data.access_token.substring(0, 20) + '...');
    } else {
      console.error('❌ Authentication failed:', response.data.error);
    }
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.error('❌ Server responded with error:', err.response?.status, err.response?.data);
    } else {
      console.error('❌ Error connecting to server:', err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
}

verifyAuth();