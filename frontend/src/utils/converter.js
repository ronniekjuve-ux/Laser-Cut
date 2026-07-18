/**
 * Local DOC converter - tries to convert DOC files using local Word converter.
 * Falls back to server-side conversion if local converter is not available.
 */

const LOCAL_CONVERTER_URL = 'http://localhost:8001';

/**
 * Check if local converter is available
 */
export async function isLocalConverterAvailable() {
  try {
    const res = await fetch(`${LOCAL_CONVERTER_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Convert DOC file using local Word converter
 * @param {File} docFile - The DOC file to convert
 * @returns {Promise<{images: Array<{name, size, url}>, count: number} | null>}
 */
export async function convertWithLocalConverter(docFile) {
  try {
    // First, we need to get the file path on the local filesystem
    // The file needs to be accessible from the local converter
    // We'll use the data/uploads/ path since it's shared via Docker bind mount
    
    const fileName = docFile.name;
    
    // Try to find the file in data/uploads/
    // The file should have been uploaded there by the backend
    const checkRes = await fetch(`${LOCAL_CONVERTER_URL}/images/`, { signal: AbortSignal.timeout(1000) });
    
    // Convert via local converter
    const res = await fetch(`${LOCAL_CONVERTER_URL}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        // The file needs to be on the local filesystem
        // We'll pass the original filename and let the converter find it
        filename: fileName 
      }),
      signal: AbortSignal.timeout(30000)
    });
    
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Convert a DOC file that's already been uploaded to the server
 * @param {string} filePath - Path to the file on the server (data/uploads/...)
 * @returns {Promise<{images: Array, count: number} | null>}
 */
export async function convertUploadedFile(filePath) {
  try {
    const res = await fetch(`${LOCAL_CONVERTER_URL}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath }),
      signal: AbortSignal.timeout(30000)
    });
    
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return data;
  } catch {
    return null;
  }
}
