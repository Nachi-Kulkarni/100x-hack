import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';

// IMPORTANT: This is a placeholder key for demonstration purposes ONLY.
// In a production environment, this key MUST be:
// 1. Securely generated (e.g., a long, random string).
// 2. Stored as an environment variable (e.g., process.env.FIELD_ENCRYPTION_KEY).
// 3. NEVER hardcoded in the source code.
// Failure to do so will result in a severe security vulnerability.
const FALLBACK_ENCRYPTION_KEY = 'your-super-secret-and-long-fallback-key-32-bytes!'; // Must be strong if ever used by mistake

const ENCRYPTION_KEY = process.env.FIELD_ENCRYPTION_KEY || FALLBACK_ENCRYPTION_KEY;

if (ENCRYPTION_KEY === FALLBACK_ENCRYPTION_KEY) {
  console.warn(
    "WARNING: Using fallback field encryption key. " +
    "This is INSECURE and for demonstration purposes ONLY. " +
    "Set a strong FIELD_ENCRYPTION_KEY environment variable in production."
  );
}
if (!process.env.FIELD_ENCRYPTION_KEY && process.env.NODE_ENV === 'production') {
    // Optional: throw an error if no key is set in production, to prevent accidental insecure deployment.
    // However, this might be too disruptive if the key is sometimes managed outside this app's direct env vars.
    // For now, the warning is the primary mechanism.
    console.error(
        "CRITICAL SECURITY WARNING: FIELD_ENCRYPTION_KEY is not set in a production environment. " +
        "Data encryption will use a fallback key, which is highly insecure. " +
        "Application should not run in this state."
    );
    // Consider throwing an error: throw new Error("FIELD_ENCRYPTION_KEY is not set in production.");
}


/**
 * Encrypts a plaintext string using AES.
 * @param text The plaintext string to encrypt.
 * @returns The encrypted string (ciphertext).
 */
export function encrypt(text: string): string {
  if (text === null || text === undefined || text === '') {
    return text; // Return as is if null, undefined, or empty
  }
  try {
    const ciphertext = AES.encrypt(text, ENCRYPTION_KEY).toString();
    return ciphertext;
  } catch (error) {
    console.error('Encryption failed:', error);
    // Depending on policy, either throw error or return original text, or a specific error marker
    // For now, re-throwing to make it visible. In some contexts, you might return original text.
    throw error;
  }
}

/**
 * Decrypts an AES-encrypted string.
 * @param encryptedText The ciphertext string to decrypt.
 * @returns The decrypted string (plaintext).
 */
export function decrypt(encryptedText: string): string {
  if (encryptedText === null || encryptedText === undefined || encryptedText === '') {
    return encryptedText; // Return as is if null, undefined, or empty
  }
  try {
    const bytes = AES.decrypt(encryptedText, ENCRYPTION_KEY);
    const originalText = bytes.toString(Utf8);
    if (!originalText) {
        // This can happen if the key is wrong or the data is corrupted/not valid ciphertext
        console.warn('Decryption resulted in empty string. Possible wrong key or malformed ciphertext.', { encryptedTextPreview: encryptedText.substring(0, 20)});
        // Return original encrypted text or handle as an error, based on policy.
        // Returning original might be confusing. Consider throwing or returning an error marker.
        // For this exercise, let's return the original encrypted text to avoid breaking flows,
        // but log a clear warning. In a real app, this needs careful consideration.
        return encryptedText;
    }
    return originalText;
  } catch (error) {
    console.error('Decryption failed:', error, { encryptedTextPreview: encryptedText.substring(0, 20) });
    // Return the original encrypted text if decryption fails, to avoid data loss in UI.
    // This means the UI might display encrypted data, indicating a problem.
    return encryptedText;
  }
}
