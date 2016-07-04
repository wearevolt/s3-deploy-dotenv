"use strict";

require('dotenv').config();
var fs   = require('fs');
var path = require('path');
var zlib = require('zlib');
var AWS  = require('aws-sdk');
var mime = require('mime');


var MAX_PART_SIZE = 20971520; // 20 MB
var CONCURRENT_PARTS = 5;
var DEFAULT_CONTENT_TYPE = 'application/octet-stream';
var DEFAULT_GZIP_LEVEL = 5;

var S3_BUCKET = process.env.S3_BUCKET;
var S3_GZIP_EXT = process.env.S3_GZIP_EXT || '';


var compress = zlib.createGzip({
    level: ~~process.env.S3_GZIP_LEVEL || DEFAULT_GZIP_LEVEL
});

var s3Stream = require('s3-upload-stream')(new AWS.S3({
    maxAsyncS3: 20,     // this is the default
    s3RetryCount: 3,    // this is the default
    s3RetryDelay: 1000, // this is the default
    multipartUploadThreshold: 20971520, // this is the default (20 MB)
    multipartUploadSize: 15728640, // this is the default (15 MB)

    region: process.env.S3_REGION,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
}));


function uploadFile (filePath, callback) {
    var read = fs.createReadStream(filePath);

    var basename =  path.basename(filePath);
    var ContentType = mime.lookup(basename, DEFAULT_CONTENT_TYPE);

    var fileExt =  path.extname(basename).replace(/^\./, '');
    var extForGzip = S3_GZIP_EXT.split(/ *, */);
    var isShouldBenGziped = extForGzip.indexOf(fileExt) > -1;

    var uploadOptions = {
        Bucket: S3_BUCKET,
        Key: basename,
        ContentType: ContentType
    };

    if(isShouldBenGziped) {
        uploadOptions.ContentEncoding = "gzip";
    }

    var upload = s3Stream.upload(uploadOptions);
    upload.maxPartSize(MAX_PART_SIZE);
    upload.concurrentParts(CONCURRENT_PARTS);
    upload.on('error', function (err) {
        callback(err)
    });
    upload.on('uploaded', function (details) {
        callback(null, details);
    });

    if (isShouldBenGziped) {
        read.pipe(compress).pipe(upload);
    } else {
        read.pipe(upload);
    }
}


// console.time('upload');
// uploadFile(path.join(process.cwd(), process.env.S3_LOCAL_DIR, 'test.bundle.js'), function (err, details) {
//     console.timeEnd('upload');
//     console.log('done', err, details);
// });

