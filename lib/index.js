"use strict";

require('dotenv').config();
var fs   = require('fs');
var path = require('path');
var zlib = require('zlib');
var AWS  = require('aws-sdk');
var mime = require('mime');
var async = require('async');


var MAX_ASYNC_STREAMS = 10;
var MAX_PART_SIZE = 20971520; // 20 MB
var CONCURRENT_PARTS = 5;
var DEFAULT_CONTENT_TYPE = 'application/octet-stream';
var DEFAULT_GZIP_LEVEL = 5;

var S3_BUCKET = process.env.S3_BUCKET;
var S3_GZIP_EXTENSIONS = (process.env.S3_GZIP_EXTENSIONS || '').split(/ *, */);



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

    //callback(null);

    console.time(file.name);
    var upload = s3Stream.upload(uploadOptions);
    upload.maxPartSize(MAX_PART_SIZE);
    upload.concurrentParts(CONCURRENT_PARTS);
    upload.on('error', function (err) {
        console.timeEnd(file.name);
        callback(err);
    });
    upload.on('uploaded', function (details) {
        console.timeEnd(file.name);
        callback(null, details);
    });

    if (isShouldBeGziped) {
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


var files = getFiles(path.join(process.cwd(), process.env.S3_LOCAL_DIR));

async.eachLimit(files, MAX_ASYNC_STREAMS, uploadFile, function (err) {
    console.log(err ? 'Error: ' + err : 'done');
});


// function uploadFile (filePath, callback) {
//     var read = fs.createReadStream(filePath);
//
//     var fileExt =  path.extname(filePath).replace(/^\./, '');
//     var ContentType = mime.lookup(filePath, DEFAULT_CONTENT_TYPE);
//     var isShouldBeGziped = S3_GZIP_EXTENSIONS.indexOf(fileExt) > -1;
//
//     // relative path
//     var basename =  path.basename(filePath);
//
//     var uploadOptions = {
//         Bucket: S3_BUCKET,
//         Key: basename,
//         ContentType: ContentType
//     };
//
//     if(isShouldBeGziped) {
//         uploadOptions.ContentEncoding = "gzip";
//     }
//
//     var upload = s3Stream.upload(uploadOptions);
//     upload.maxPartSize(MAX_PART_SIZE);
//     upload.concurrentParts(CONCURRENT_PARTS);
//     upload.on('error', function (err) {
//         callback(err)
//     });
//     upload.on('uploaded', function (details) {
//         callback(null, details);
//     });
//
//     if (isShouldBeGziped) {
//         read.pipe(compress).pipe(upload);
//     } else {
//         read.pipe(upload);
//     }
// }
