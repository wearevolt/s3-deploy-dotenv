#!/usr/bin/env node

require('dotenv').config();

var deploy = require('../lib');
var env = process.env;

var isDebugMode = !!env.S3_DEBUG_MODE;

deploy.config({
    // S3 required
    region:          env.S3_REGION,
    accessKeyId:     env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    bucket :         env.S3_BUCKET,

    // S3 optional
    maxAsyncStreams:       env.S3_MAX_ASYNC_STREAMS|0,
    uploadConcurrentParts: env.S3_UPLOAD_CONCURRENT_PARTS|0,
    uploadMaxPartSize:     env.S3_UPLOAD_MAX_PART_SIZE|0,
    defaultContentType:    env.S3_DEFAULT_CONTENT_TYPE|0,
    s3RetryCount:          env.S3_RETRY_COUNT|0,
    s3RetryDelay:          env.S3_RETRY_DELAY|0,
    multipartUploadThreshold: env.S3_MULTIPART_UPLOAD_THRESHOLD|0,
    multipartUploadSize:      env.S3_MULTIPART_UPLOAD_SIZE|0,

    // CloudFront
    cloudFrontDistribution: env.CLOUDFRONT_DISTRIBUTION,

    // locations (optional)
    localDir:  env.S3_LOCAL_DIR,
    remoteDir: env.S3_PREFIX,

    // gzip (optional)
    gzipLevel:       env.S3_GZIP_LEVEL|0,
    gzipExtensions: (env.S3_GZIP_EXTENSIONS || '').split(/ *, */),

    // Replace on maintenance
    replaceUntilMaintenance: (env.S3_REPLACE_UNTIL_MAINTENANCE || '').split(/ *, */)
});

deploy.on('start', function (options) {
    console.log('Start upload files to', options.bucket);
});

deploy.on('error', function (err) {
    console.log('\nError: ' + err);
});

deploy.on('upload', function (file, percent, details) {
    console.log(' ' + percent.toFixed(0).slice(-3) +  '%', file.fullPath, '->', file.remotePath, file.size);
    if (isDebugMode) {
        console.log(' DEBUG>', details, '\n');
    }
});

deploy.on('complete', function (count) {
    console.log('\n', count, 'files uploaded');
});


deploy.upload();
