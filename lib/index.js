//"use strict";

require('dotenv').config();
var fs   = require('fs');
var path = require('path');
var zlib = require('zlib');
var AWS  = require('aws-sdk');
var mime = require('mime');
var async = require('async');
var s3UploadStream = require('s3-upload-stream');


var S3_MAX_ASYNC_STREAMS = process.env.S3_MAX_ASYNC_STREAMS || 20;
var S3_GZIP_LEVEL = ~~process.env.S3_GZIP_LEVEL || 5;
var S3_BUCKET = process.env.S3_BUCKET;
var S3_GZIP_EXTENSIONS = (process.env.S3_GZIP_EXTENSIONS || '').split(/ *, */);

var UPLOAD_MAX_PART_SIZE = 20971520; // 20 MB
var UPLOAD_CONCURRENT_PARTS = 5;
var DEFAULT_CONTENT_TYPE = 'application/octet-stream';


var s3Stream = s3UploadStream(new AWS.S3({
    maxAsyncS3: S3_MAX_ASYNC_STREAMS,     // this is the default
    s3RetryCount: 3,    // this is the default
    s3RetryDelay: 1000, // this is the default
    multipartUploadThreshold: 20971520, // this is the default (20 MB)
    multipartUploadSize: 15728640, // this is the default (15 MB)

    region: process.env.S3_REGION,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
}));


function uploadFile (file, callback) {
    var readStream = fs.createReadStream(file.fullPath);

    var isShouldBeGziped = S3_GZIP_EXTENSIONS.indexOf(file.ext) > -1;
    var remotePath =  path.join(process.env.S3_PREFIX, file.url).split(path.sep).join('/');

    var uploadOptions = {
        Bucket: S3_BUCKET,
        Key: remotePath,
        ContentType: file.mime
    };

    if(isShouldBeGziped) {
        uploadOptions.ContentEncoding = "gzip";
    }

    var upload = s3Stream.upload(uploadOptions);
    upload.maxPartSize(UPLOAD_MAX_PART_SIZE);
    upload.concurrentParts(UPLOAD_CONCURRENT_PARTS);
    upload.on('error', function (err) {
        callback(err);
    });
    upload.on('uploaded', function (details) {
        callback(null, details);
    });

    if (isShouldBeGziped) {
        var compress = zlib.createGzip({ level: S3_GZIP_LEVEL });
        readStream.pipe(compress).pipe(upload);
    } else {
        readStream.pipe(upload);
    }
}


function getFiles(base, dir) {
    var relativePath = dir || '';
    var dirPath = path.resolve(base, relativePath);
    var files;
    try {
        files = fs.readdirSync(dirPath);
    } catch (e) {
        throw new Error(e);
    }

    return  files.reduce(function (result, file) {
        var full = path.join(dirPath, file);
        var relative = path.join(relativePath, file);
        var url = relative.split(path.sep).join('/');
        var stats = fs.statSync(full);
        var ext = path.extname(file).replace(/^\./, '');
        var mimeType = mime.lookup(file, DEFAULT_CONTENT_TYPE);

        if(stats.isDirectory()) {
            getFiles(base, relative).map(function (file) {
                result.push(file);
            });

        } else if (stats.isFile()) {
            result.push({
                name: file,
                fullPath: full,
                url: url,
                ext: ext,
                mime: mimeType
            })
        }

        return result;
    }, []);

}


var sourseDir = path.join(process.cwd(), process.env.S3_LOCAL_DIR);

console.log('Collect files in', sourseDir);
var files = getFiles(sourseDir);
console.log('');

var complete = 0;
console.log('Start upload files to', S3_BUCKET);
async.eachLimit(files, S3_MAX_ASYNC_STREAMS, function (file, cb) {
    uploadFile(file, function (err, details) {
        complete++;
        console.log((' '+Number(complete/files.length*100).toFixed(0)).slice(-3) + '%', '->', file.fullPath);
        cb(err, details);
    })
}, function (err) {
    console.log(err ? 'Error: ' + err : 'done');
});
