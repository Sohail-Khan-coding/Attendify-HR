const mongoose = require('mongoose');

function getPhotoBucket() {
  if (!mongoose.connection.db) {
    throw new Error('Photo storage is unavailable until MongoDB is connected.');
  }

  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'attendancePhotos'
  });
}

async function storeAttendancePhoto(file) {
  const bucket = getPhotoBucket();
  const uploadStream = bucket.openUploadStream(file.originalname, {
    contentType: file.mimetype,
    metadata: { contentType: file.mimetype }
  });

  await new Promise((resolve, reject) => {
    uploadStream.once('finish', resolve);
    uploadStream.once('error', reject);
    uploadStream.end(file.buffer);
  });

  return uploadStream.id.toString();
}

async function deleteAttendancePhoto(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return;

  try {
    await getPhotoBucket().delete(new mongoose.Types.ObjectId(id));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

module.exports = { getPhotoBucket, storeAttendancePhoto, deleteAttendancePhoto };
