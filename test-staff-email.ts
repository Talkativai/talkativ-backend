import { sendStaffCredentials } from './src/services/email.service.js';

async function main() {
  console.log('Sending test staff email...');
  try {
    const result = await sendStaffCredentials(
      'oladejiolaoluwa46@gmail.com', // fallback, wait let me send to SMTP_USER
      'Test User',
      'Test Business',
      'test.user',
      'password123'
    );
    console.log('Email sent successfully!');
    console.log(result);
  } catch (e) {
    console.error('Email failed:');
    console.error(e);
  }
}
main();
