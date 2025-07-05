// Secure Storage Module for Curator
// Handles encryption/decryption of sensitive credentials

// Determine the current execution context (browser window or service worker)
const isServiceWorker = typeof window === 'undefined';

// Use the appropriate crypto API based on context
const cryptoAPI = isServiceWorker ? crypto : window.crypto;

/**
 * This module helps secure credentials storage by:
 * 1. Using Chrome's identity API to get a unique, per-user encryption key
 * 2. Encrypting sensitive data using WebCrypto AES-GCM before storing
 * 3. Providing a consistent API for secure get/set operations
 * 4. Implementing automatic key rotation
 */

// Constants
const ENCRYPTION_KEY_ID = 'curator_encryption_key';
const KEY_CREATION_DATE_ID = 'curator_key_creation_date';
const KEY_ROTATION_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
const ENC_PREFIX = 'AES_GCM_';
const IV_SIZE = 12; // 12 bytes for AES-GCM
const KEY_SIZE = 256; // 256-bit AES key
const KEY_USES = ['encrypt', 'decrypt']; // Key usage
const TAG_LENGTH = 128; // 128-bit authentication tag

/**
 * Generate a unique encryption key for the user
 * This uses the user's Chrome identity as a seed
 * @returns {Promise<CryptoKey>} WebCrypto key for AES-GCM
 */
async function generateEncryptionKey() {
  try {
    // Use a stable identifier from Chrome identity API if available
    // This will fail in dev mode - fallback to a more secure random alternative
    const seed = await new Promise(resolve => {
      try {
        chrome.identity.getProfileUserInfo(info => {
          if (chrome.runtime.lastError) {
            console.warn('Could not get user info for key generation, using fallback method');
            resolve(null);
            return;
          }
          
          // Use user ID or email as seed for the key
          // This ensures each user has a unique key
          const seed = info.id || info.email || Date.now().toString();
          resolve(seed);
        });
      } catch (e) {
        console.warn('Identity API error, using fallback key generation');
        resolve(null);
      }
    });

    if (seed && cryptoAPI && cryptoAPI.subtle) {
      // Derive a key from the seed using PBKDF2
      const encoder = new TextEncoder();
      const keyMaterial = await cryptoAPI.subtle.importKey(
        'raw',
        encoder.encode(seed),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      );
      
      // Generate a salt from the seed
      const salt = await cryptoAPI.subtle.digest(
        'SHA-256',
        encoder.encode(seed + 'curator-salt')
      );
      
      // Derive the actual encryption key using PBKDF2
      return cryptoAPI.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: KEY_SIZE },
        true, // extractable to enable storage
        KEY_USES
      );
    }
    
    // Fallback to a secure random key if identity API isn't available
    return cryptoAPI.subtle.generateKey(
      { name: 'AES-GCM', length: KEY_SIZE },
      true, // extractable to enable storage
      KEY_USES
    );
  } catch (error) {
    console.error('Error generating encryption key:', error);
    
    // Last resort fallback - generate a random key
    return cryptoAPI.subtle.generateKey(
      { name: 'AES-GCM', length: KEY_SIZE },
      true,
      KEY_USES
    );
  }
}

/**
 * Store a CryptoKey in chrome.storage
 * @param {CryptoKey} cryptoKey The WebCrypto key to store
 * @returns {Promise<void>}
 */
async function storeCryptoKey(cryptoKey) {
  try {
    // Export the key to raw format for storage
    const exportedKey = await cryptoAPI.subtle.exportKey('raw', cryptoKey);
    
    // Convert to Base64 for storage
    const base64Key = btoa(String.fromCharCode(...new Uint8Array(exportedKey)));
    
    // Store the key and its creation date
    const creationDate = Date.now();
    await new Promise(resolve => {
      chrome.storage.local.set({
        [ENCRYPTION_KEY_ID]: base64Key,
        [KEY_CREATION_DATE_ID]: creationDate
      }, resolve);
    });
    
    return cryptoKey;
  } catch (error) {
    console.error('Error storing crypto key:', error);
    throw error;
  }
}

/**
 * Load a stored CryptoKey from chrome.storage
 * @returns {Promise<{key: CryptoKey|null, creationDate: number|null}>} The loaded WebCrypto key and its creation date
 */
async function loadCryptoKey() {
  try {
    const result = await new Promise(resolve => {
      chrome.storage.local.get([ENCRYPTION_KEY_ID, KEY_CREATION_DATE_ID], result => {
        resolve(result);
      });
    });
    
    const storedKey = result[ENCRYPTION_KEY_ID];
    const creationDate = result[KEY_CREATION_DATE_ID] || null;
    
    if (!storedKey) return { key: null, creationDate: null };
    
    // Convert from Base64 to ArrayBuffer
    const binaryKey = atob(storedKey);
    const bytes = new Uint8Array(binaryKey.length);
    for (let i = 0; i < binaryKey.length; i++) {
      bytes[i] = binaryKey.charCodeAt(i);
    }
    
    // Import the key for use with WebCrypto
    const key = await cryptoAPI.subtle.importKey(
      'raw',
      bytes,
      { name: 'AES-GCM', length: KEY_SIZE },
      false, // not extractable once imported for use
      KEY_USES
    );
    
    return { key, creationDate };
  } catch (error) {
    console.error('Error loading crypto key:', error);
    return { key: null, creationDate: null };
  }
}

/**
 * Check if it's time to rotate the encryption key
 * @param {number} creationDate The timestamp when the key was created
 * @returns {boolean} Whether the key should be rotated
 */
function shouldRotateKey(creationDate) {
  if (!creationDate) return true;
  
  const now = Date.now();
  const keyAge = now - creationDate;
  
  return keyAge > KEY_ROTATION_INTERVAL;
}

/**
 * Rotate encryption key and re-encrypt all sensitive data
 * @returns {Promise<CryptoKey>} The new encryption key
 */
async function rotateEncryptionKey() {
  try {
    // Load the current key and all encrypted data
    const { key: oldKey } = await loadCryptoKey();
    
    // Only proceed if we have an old key to migrate from
    if (!oldKey) {
      const newKey = await generateEncryptionKey();
      await storeCryptoKey(newKey);
      return newKey;
    }
    
    // Get all storage data to find encrypted values
    const allData = await new Promise(resolve => {
      chrome.storage.local.get(null, resolve);
    });
    
    // Generate a new key
    const newKey = await generateEncryptionKey();
    
    // Re-encrypt all sensitive data with the new key
    const updates = {};
    
    for (const [key, value] of Object.entries(allData)) {
      if (key === ENCRYPTION_KEY_ID || key === KEY_CREATION_DATE_ID) continue;
      
      if (typeof value === 'string' && (value.startsWith(ENC_PREFIX) || value.startsWith('ENC_'))) {
        // Decrypt with old key
        const decrypted = await decrypt(value, oldKey);
        // Re-encrypt with new key
        updates[key] = await encrypt(decrypted, newKey);
      } else if (typeof value === 'object' && value !== null) {
        const processObject = async (obj) => {
          const result = JSON.parse(JSON.stringify(obj)); // Clone the object
          
          const promises = [];
          
          // Recursively process all string properties
          for (const prop in result) {
            if (typeof result[prop] === 'string' && 
               (result[prop].startsWith(ENC_PREFIX) || result[prop].startsWith('ENC_'))) {
              promises.push(
                (async () => {
                  // Decrypt with old key
                  const decrypted = await decrypt(result[prop], oldKey);
                  // Re-encrypt with new key
                  result[prop] = await encrypt(decrypted, newKey);
                })()
              );
            } else if (typeof result[prop] === 'object' && result[prop] !== null) {
              promises.push(
                (async () => {
                  result[prop] = await processObject(result[prop]);
                })()
              );
            }
          }
          
          await Promise.all(promises);
          return result;
        };
        
        updates[key] = await processObject(value);
      }
    }
    
    // Save all updates and the new key
    await new Promise(resolve => {
      chrome.storage.local.set(updates, resolve);
    });
    
    // Store the new key last, after all data has been re-encrypted
    await storeCryptoKey(newKey);
    
    return newKey;
  } catch (error) {
    console.error('Error rotating encryption key:', error);
    throw error;
  }
}

/**
 * Get the current encryption key or generate a new one
 * @returns {Promise<CryptoKey>} The WebCrypto key
 */
async function getEncryptionKey() {
  // Try to load an existing key
  const { key, creationDate } = await loadCryptoKey();
  
  // Check if the key needs rotation
  if (key && shouldRotateKey(creationDate)) {
    console.log('Rotating encryption key due to age');
    return rotateEncryptionKey();
  }
  
  // Return existing key or generate a new one
  if (key) return key;
  
  // Generate a new key if none exists
  const newKey = await generateEncryptionKey();
  await storeCryptoKey(newKey);
  return newKey;
}

/**
 * Generate a random initialization vector
 * @returns {Uint8Array} Random IV for AES-GCM
 */
function generateIV() {
  return cryptoAPI.getRandomValues(new Uint8Array(IV_SIZE));
}

/**
 * Encrypt text using AES-GCM
 * @param {string} text Text to encrypt
 * @param {CryptoKey} key WebCrypto key
 * @returns {Promise<string>} Encrypted text with Base64 encoding
 */
async function encrypt(text, key) {
  if (!text) return text;
  
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // Generate a random IV
    const iv = generateIV();
    
    // Encrypt the data
    const encryptedData = await cryptoAPI.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: TAG_LENGTH
      },
      key,
      data
    );
    
    // Combine IV and encrypted data
    const result = new Uint8Array(iv.length + encryptedData.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encryptedData), iv.length);
    
    // Convert to Base64 with prefix
    return ENC_PREFIX + btoa(String.fromCharCode(...result));
  } catch (error) {
    console.error('Encryption error:', error);
    // If encryption fails, return the original text
    // This is a fallback to prevent data loss, though security is compromised
    return text;
  }
}

/**
 * Decrypt text using AES-GCM
 * @param {string} text Encrypted text with Base64 encoding
 * @param {CryptoKey} key WebCrypto key
 * @returns {Promise<string>} Decrypted text
 */
async function decrypt(text, key) {
  if (!text) return text;
  
  try {
    // Handle different encryption formats
    if (text.startsWith(ENC_PREFIX)) {
      // AES-GCM format
      // Remove prefix and decode from Base64
      const encryptedData = atob(text.substring(ENC_PREFIX.length));
      const buffer = new Uint8Array(encryptedData.length);
      for (let i = 0; i < encryptedData.length; i++) {
        buffer[i] = encryptedData.charCodeAt(i);
      }
      
      // Extract IV and encrypted data
      const iv = buffer.slice(0, IV_SIZE);
      const data = buffer.slice(IV_SIZE);
      
      // Decrypt the data
      const decryptedBuffer = await cryptoAPI.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          tagLength: TAG_LENGTH
        },
        key,
        data
      );
      
      // Convert the decrypted data back to text
      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);
    } else if (text.startsWith('ENC_')) {
      // Legacy XOR format
      return legacyDecrypt(text);
    } else {
      // Not encrypted
      return text;
    }
  } catch (error) {
    console.error('Decryption error:', error);
    
    // If decryption fails, try legacy decryption as a fallback
    if (text.startsWith('ENC_')) {
      return legacyDecrypt(text);
    }
    
    // Return the original text if decryption fails completely
    return text;
  }
}

/**
 * Legacy XOR decryption for backward compatibility
 * @param {string} text Text to decrypt
 * @returns {string} Decrypted text
 */
async function legacyDecrypt(text) {
  if (!text || !text.startsWith('ENC_')) return text;
  
  try {
    // Get the legacy key in string format
    const legacyKeyStr = await new Promise(resolve => {
      chrome.storage.local.get(ENCRYPTION_KEY_ID, result => {
        resolve(result[ENCRYPTION_KEY_ID] || '');
      });
    });
    
    if (!legacyKeyStr) return text;
    
    const encryptedText = atob(text.substring(4)); // 'ENC_' is 4 chars
    const encryptedChars = encryptedText.split('');
    const keyChars = legacyKeyStr.split('');
    
    const decrypted = encryptedChars.map((char, i) => {
      const keyChar = keyChars[i % keyChars.length];
      return String.fromCharCode(char.charCodeAt(0) ^ keyChar.charCodeAt(0));
    }).join('');
    
    return decrypted;
  } catch (error) {
    console.error('Legacy decryption error:', error);
    return text;
  }
}

/**
 * Securely store a value with encryption
 * @param {string} key Storage key
 * @param {any} value Value to store
 * @param {boolean} shouldEncrypt Whether to encrypt the value
 * @returns {Promise<void>}
 */
async function secureSet(key, value, shouldEncrypt = false) {
  try {
    let finalValue = value;
    
    if (shouldEncrypt) {
      const encryptionKey = await getEncryptionKey();
      
      if (typeof value === 'string') {
        // Directly encrypt string values
        finalValue = await encrypt(value, encryptionKey);
      } else if (typeof value === 'object' && value !== null) {
        // Handle objects by converting to JSON first
        finalValue = JSON.parse(JSON.stringify(value)); // Clone to avoid modifying original
        
        // Recursively encrypt strings in the object
        const encryptObjectValues = async (obj) => {
          const promises = [];
          
          for (const prop in obj) {
            if (typeof obj[prop] === 'string') {
              promises.push(
                encrypt(obj[prop], encryptionKey).then(encrypted => {
                  obj[prop] = encrypted;
                })
              );
            } else if (typeof obj[prop] === 'object' && obj[prop] !== null) {
              promises.push(encryptObjectValues(obj[prop]));
            }
          }
          
          await Promise.all(promises);
          return obj;
        };
        
        finalValue = await encryptObjectValues(finalValue);
      }
    }
    
    return new Promise(resolve => {
      chrome.storage.local.set({ [key]: finalValue }, resolve);
    });
  } catch (error) {
    console.error('Secure storage error:', error);
    throw error;
  }
}

/**
 * Securely retrieve a value with decryption if needed
 * @param {string} key Storage key
 * @param {any} defaultValue Default value if not found
 * @param {boolean} isEncrypted Whether the value is encrypted
 * @returns {Promise<any>} The retrieved value
 */
async function secureGet(key, defaultValue = null, isEncrypted = false) {
  try {
    return new Promise(resolve => {
      chrome.storage.local.get({ [key]: defaultValue }, async (result) => {
        let value = result[key];
        
        if (isEncrypted && value) {
          const encryptionKey = await getEncryptionKey();
          
          if (typeof value === 'string') {
            value = await decrypt(value, encryptionKey);
          } else if (typeof value === 'object' && value !== null) {
            // Clone to avoid modifying stored object
            value = JSON.parse(JSON.stringify(value));
            
            // Recursively decrypt strings in the object
            const decryptObjectValues = async (obj) => {
              const promises = [];
              
              for (const prop in obj) {
                if (typeof obj[prop] === 'string' && 
                   (obj[prop].startsWith(ENC_PREFIX) || obj[prop].startsWith('ENC_'))) {
                  promises.push(
                    decrypt(obj[prop], encryptionKey).then(decrypted => {
                      obj[prop] = decrypted;
                    })
                  );
                } else if (typeof obj[prop] === 'object' && obj[prop] !== null) {
                  promises.push(decryptObjectValues(obj[prop]));
                }
              }
              
              await Promise.all(promises);
              return obj;
            };
            
            value = await decryptObjectValues(value);
          }
        }
        
        resolve(value);
      });
    });
  } catch (error) {
    console.error('Secure retrieval error:', error);
    return defaultValue;
  }
}

/**
 * Force key rotation regardless of key age
 * @returns {Promise<boolean>} Success status
 */
async function forceKeyRotation() {
  try {
    await rotateEncryptionKey();
    return true;
  } catch (error) {
    console.error('Forced key rotation failed:', error);
    return false;
  }
}

// Export secure storage functions
export {
  secureSet,
  secureGet,
  forceKeyRotation
};