import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '.env') });

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;

if (!sid || !token) {
  console.error("Missing Twilio credentials in your .env file!");
  process.exit(1);
}

async function getTwilioNumber() {
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(sid + ':' + token).toString('base64')}`
      }
    });

    if (!response.ok) {
        console.error("Failed to fetch from Twilio. Status:", response.status);
        const text = await response.text();
        console.error(text);
        return;
    }

    const data = await response.json();
    if (data.incoming_phone_numbers && data.incoming_phone_numbers.length > 0) {
      console.log("\n=============================================");
      console.log("SUCCESS! Your Twilio Phone Number is:");
      console.log(data.incoming_phone_numbers[0].phone_number);
      console.log("=============================================\n");
    } else {
      console.log("No phone numbers found in this Twilio account. You may need to click 'Get a Trial Number' in your Twilio Console first.");
    }
  } catch (err) {
    console.error("Error fetching number:", err);
  }
}

getTwilioNumber();
