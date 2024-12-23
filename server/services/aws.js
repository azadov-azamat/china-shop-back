const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Upload } = require('@aws-sdk/lib-storage');
const sharp = require('sharp');
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { Readable } = require('stream');

const client = new S3Client({
  region: process.env.S3_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  useAccelerateEndpoint: true,
  signatureVersion: 'v4',
  // credentials: {
  //   accessKeyId: process.env.AWS_ACCESS_KEY,
  //   secretAccessKey: process.env.AWS_SECRET_KEY
  // }
  // "endpoint": "http://localhost:8080",
  // computeChecksums: false,
});

function getSignedUploadUrl(path, props = {}) {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    ACL: 'public-read',
    Key: path,
    ...props,
  });

  return getSignedUrl(client, command, { expiresIn: 60 * 60 });
}

function deleteObject(path) {
  const command = new DeleteObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: path,
  });

  return client.send(command);
}

async function resizeAndUploadImage(
  path,
  newPath,
  { dimensions = { width: 400, height: 300 } } = {}
) {
  const getObjectCommand = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: path,
  });
  // Get the object as a stream
  const data = await client.send(getObjectCommand);
  const readStream = data.Body;

  // Resize the image using sharp
  const resizeStream = sharp().resize(dimensions.width, dimensions.height);

  // Transform the sharp stream to a readable stream
  const transformedStream = new Readable();
  transformedStream._read = () => {}; // _read is required but you can noop it
  resizeStream.on('data', chunk => transformedStream.push(chunk));
  resizeStream.on('end', () => transformedStream.push(null));

  // Pipe the S3 stream to the resize stream
  readStream.pipe(resizeStream);

  return await upload(newPath, transformedStream);
}

async function upload(newPath, transformedStream) {
  const params = {
    Bucket: process.env.S3_BUCKET,
    ACL: 'public-read',
    Key: newPath,
    Body: transformedStream,
  };

  const uploader = new Upload({ client, params });
  await uploader.done();

  return `https://${process.env.S3_BUCKET}.s3-${process.env.S3_REGION}.amazonaws.com/${newPath}`;
}

module.exports = { getSignedUploadUrl, deleteObject, resizeAndUploadImage, upload };
