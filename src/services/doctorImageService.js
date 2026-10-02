// src/services/doctorImageService.js
import { storage, ref, uploadBytes, getDownloadURL, deleteObject } from '../firebase';

/**
 * ডাক্তারের ছবি upload করে download URL return করে
 * @param {string} hospitalId
 * @param {string} doctorId
 * @param {File} file
 * @returns {Promise<{url: string, path: string}>}
 */
export const uploadDoctorImage = async (hospitalId, doctorId, file) => {
  if (!hospitalId || !doctorId || !file) {
    throw new Error('Missing hospitalId, doctorId or file');
  }

  // ✅ File validation
  if (!file.type.startsWith('image/')) {
    throw new Error('শুধু ছবি (image) ফাইল আপলোড করুন');
  }
  if (file.size > 3 * 1024 * 1024) {
    throw new Error('ছবির সাইজ সর্বোচ্চ 3MB হতে পারবে');
  }

  // ✅ Extension বের করুন
  const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
  const path = `hospitals/${hospitalId}/doctors/${doctorId}/profile_${Date.now()}.${ext}`;

  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType: file.type,
    cacheControl: 'public, max-age=31536000',
  });

  const url = await getDownloadURL(storageRef);
  return { url, path };
};

/**
 * পুরোনো ছবি delete করে
 */
export const deleteDoctorImage = async (imagePath) => {
  if (!imagePath) return;
  try {
    const storageRef = ref(storage, imagePath);
    await deleteObject(storageRef);
  } catch (err) {
    // File already missing হলে ignore
    if (err.code !== 'storage/object-not-found') {
      console.warn('⚠️ deleteDoctorImage error:', err.message);
    }
  }
};

export default { uploadDoctorImage, deleteDoctorImage };