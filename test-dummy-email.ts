import { sendStaffCredentials } from './src/services/email.service.js';

async function test() {
  try {
    const res = await sendStaffCredentials('dummytest404@example.com', 'John', 'Talkativ', 'john.doe123', 'secretpass');
    console.log(res);
  } catch (err) {
    console.error(err);
  }
}
test();
