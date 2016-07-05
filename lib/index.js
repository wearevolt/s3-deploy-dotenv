"use strict";

var events = require('events');
var fs   = require('fs');
var path = require('path');
var zlib = require('zlib');
var AWS  = require('aws-sdk');
var mime = require('mime');
var async = require('async');
var s3UploadStream = require('s3-upload-stream');

var eventEmitter = new events.EventEmitter();

var options = {
    region:          '', // required
    accessKeyId:     '', // required
    secretAccessKey: '', // required
    bucket :         '', // required

    // S3 optional
    defaultContentType: 'application/octet-stream',
    maxAsyncStreams: 20,
    uploadConcurrentParts: 5,
    uploadMaxPartSize: 20971520, // 20 MB
    s3RetryCount: 3,
    s3RetryDelay: 1000,
    multipartUploadThreshold: 20971520, // 20 MB
    multipartUploadSize: 15728640, // 15 MB

    // locations (optional)
    localDir:        '', // default project root directory
    remoteDir:       '', // default server root directory,

    // gzip (optional)
    gzipLevel:      5,
    gzipExtensions: []
};


function createS3Stream () {
    return s3UploadStream(new AWS.S3({
        maxAsyncS3: options.maxAsyncStreams,
        s3RetryCount: options.s3RetryCount,
        s3RetryDelay: options.s3RetryDelay,
        multipartUploadThreshold: options.multipartUploadThreshold,
        multipartUploadSize: options.multipartUploadSize,
        region: options.region,
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey
    }));
}


function uploadFile (file, callback) {
    var readStream = fs.createReadStream(file.fullPath);

    var isShouldBeGzipped = options.gzipExtensions.indexOf(file.ext) > -1;
    var remotePath =  path.join(options.remoteDir, file.url).split(path.sep).join('/');

    var uploadOptions = {
        Bucket: options.bucket,
        Key: remotePath,
        ContentType: file.mime
    };

    if(isShouldBeGzipped) {
        uploadOptions.ContentEncoding = "gzip";
    }

    var upload = createS3Stream().upload(uploadOptions);

    upload.maxPartSize(options.uploadMaxPartSize);
    upload.concurrentParts(options.uploadConcurrentParts);

    upload.on('error', function (err) {
        callback(err);
    });

    upload.on('uploaded', function (details) {
        callback(null, details);
    });

    if (isShouldBeGzipped) {
        var compress = zlib.createGzip({ level: options.gzipLevel });
        readStream.pipe(compress).pipe(upload);
    } else {
        readStream.pipe(upload);
    }
}


function getAllFiles (base, dir) {
    var relativePath = dir || '';
    var dirPath = path.resolve(base, relativePath);
    var files;
    try {
        files = fs.readdirSync(dirPath);
    } catch (err) {
        eventEmitter.emit('error', err);
        return null;
    }

    return  files.reduce(function (result, file) {
        var full = path.join(dirPath, file);
        var relative = path.join(relativePath, file);
        var url = relative.split(path.sep).join('/');
        var stats = fs.statSync(full);
        var ext = path.extname(file).replace(/^\./, '');
        var mimeType = mime.lookup(file, options.defaultContentType);

        if(stats.isDirectory()) {
            getAllFiles(base, relative).map(function (file) {
                result.push(file);
            });

        } else if (stats.isFile()) {
            result.push({
                name: file,
                fullPath: full,
                url: url,
                ext: ext,
                mime: mimeType,
                size: stats.size
            });
        }

        return result;
    }, []);

}

function config (userOptions) {
    for (var option in userOptions) if (userOptions.hasOwnProperty(option)) {
        var value = userOptions[option];
        if (!!value) {
            options[option] = value;
        }
    }
}

function upload () {
    eventEmitter.emit('start', options);

    var sourceDir = path.join(process.cwd(), options.localDir);
    var files = getAllFiles(sourceDir);
    if (!files) return;

    var counter = 0;
    async.eachLimit(files, options.maxAsyncStreams, function (file, cb) {

        uploadFile(file, function (err, details) {
            counter++;

            if (!err) {
                var percent = Number(counter/files.length*100);
                eventEmitter.emit('upload', file, percent, details);
            }

            cb(err, details);
        })

    }, function (err) {
        if (err) {
            eventEmitter.emit('error', err);
        } else {
            eventEmitter.emit('complete', counter);
        }
    });

}


eventEmitter.config = config;
eventEmitter.upload = upload;

module.exports = eventEmitter;

