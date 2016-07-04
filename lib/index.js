"use strict";

require('dotenv').config();

var fs = require('fs');
var path = require('path');
var s3 = require('s3');


var client = s3.createClient({
    maxAsyncS3: 20,     // this is the default
    s3RetryCount: 3,    // this is the default
    s3RetryDelay: 1000, // this is the default
    multipartUploadThreshold: 20971520, // this is the default (20 MB)
    multipartUploadSize: 15728640, // this is the default (15 MB)
    s3Options: {
        region: process.env.S3_REGION,
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    }
});

var params = {
    localFile: path.join(process.cwd(), 'test.bundle.js'),

    s3Params: {
        Bucket: process.env.S3_BUCKET,
        Key: "test.bundle.js"
    }
};


var uploader = client.uploadFile(params);

uploader.on('error', function(err) {
    console.error("unable to sync:", err.stack);
});

uploader.on('progress', function() {
    console.log("progress", uploader.progressAmount, uploader.progressTotal);
});

uploader.on('end', function() {
    console.log("done uploading... may be... not sure...");
});



console.log(process.env);