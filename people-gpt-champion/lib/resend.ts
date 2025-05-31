import { Resend } from 'resend';

let resendClient: Resend | null = null;

const getResendClient = () => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Resend API key not configured');
  }

  if (resendClient) {
    return resendClient;
  }

  resendClient = new Resend(process.env.RESEND_API_KEY);

  return resendClient;
};

export interface EmailOptions {
  to: string | string[];
  from: string; // Must be a verified domain in Resend
  subject: string;
  html: string;
  text?: string; // Optional text version
  // Add other Resend options as needed, e.g., cc, bcc, attachments
}

export const sendEmail = async (options: EmailOptions) => {
  const client = getResendClient();
  try {
    const { data, error } = await client.emails.send({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      console.error('Error sending email:', error);
      // Rethrow or handle as appropriate for your application
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('Email sent successfully:', data);
    return data;
  } catch (error) {
    console.error('Exception in sendEmail:', error);
    // Rethrow or handle
    throw error;
  }
};

export { getResendClient };

// Example usage (commented out):
// const exampleSend = async () => {
//   try {
//     await sendEmail({
//       to: 'test@example.com',
//       from: 'YourApp <noreply@yourverifieddomain.com>',
//       subject: 'Hello from Resend!',
//       html: '<strong>It works!</strong>',
//     });
//   } catch (e) {
//     // Handle error
//   }
// };
