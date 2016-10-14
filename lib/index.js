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

    // CloudFront
    cloudFrontDistribution: '',

    // locations (optional)
    localDir:        '', // default project root directory
    remoteDir:       '', // default server root directory,

    // gzip (optional)
    gzipLevel:      5,
    gzipExtensions: [],

    // Replace on maintenance
    replaceUntilMaintenance: []

};


function createS3 () {
  return new AWS.S3({
    maxAsyncS3: options.maxAsyncStreams,
    s3RetryCount: options.s3RetryCount,
    s3RetryDelay: options.s3RetryDelay,
    multipartUploadThreshold: options.multipartUploadThreshold,
    multipartUploadSize: options.multipartUploadSize,
    region: options.region,
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey
  })
}


function createCloudfront () {
  var cloudFront = new AWS.CloudFront();

  cloudFront.config.update({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey
  });

  return cloudFront;
}


function uploadFile (file, callback) {
    var readStream = fs.createReadStream(file.fullPath);

    var isShouldBeGzipped = options.gzipExtensions.indexOf(file.ext) > -1;

    var uploadOptions = {
        Bucket: options.bucket,
        Key: file.remotePath,
        ContentType: file.mime
    };

    if(isShouldBeGzipped) {
        uploadOptions.ContentEncoding = "gzip";
    }

    var upload = s3UploadStream(createS3()).upload(uploadOptions);

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

        var remotePath = path.join(options.remoteDir, relative).split(path.sep).join('/');

        var stats = fs.statSync(full);
        var ext = path.extname(file).replace(/^\./, '');
        var mimeType = mime.lookup(file, options.defaultContentType);

        if(stats.isDirectory()) {
            getAllFiles(base, relative).map(function (file) {
                result.push(file);
            });

        } else if (stats.isFile()) {
            result.push({
                fullPath: full,
                remotePath: remotePath,
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


function getMaintenanceFilesInfo (sourceDir, files) {
    var replaceUntilMaintenance = options.replaceUntilMaintenance;
    var originalFilePath = replaceUntilMaintenance[0] && path.join(sourceDir, replaceUntilMaintenance[0]);
    var maintenanceFilePath = replaceUntilMaintenance[1] && path.join(sourceDir, replaceUntilMaintenance[1]);

    var originalFileInfo = null;
    var maintenanceFileInfo = null;

    files.forEach(function (file) {
        if (file.fullPath === originalFilePath) originalFileInfo = file;
        if (file.fullPath === maintenanceFilePath) maintenanceFileInfo = file;
    });

    if (!originalFileInfo || !maintenanceFileInfo) {
        return null;
    }

    if (originalFileInfo.ext !== maintenanceFileInfo.ext) {
        console.warn('WARNING>', 'Target and stub files should have same extensions!');
        return null;
    }

    var stubFileInfo = {
        remotePath: originalFileInfo.remotePath,

        fullPath: maintenanceFileInfo.fullPath,
        ext: maintenanceFileInfo.ext,
        mime: maintenanceFileInfo.mime,
        size: maintenanceFileInfo.size
    };

    return {
        stubFileInfo: stubFileInfo,
        originalFileInfo: originalFileInfo
    };
}


function upload () {
    eventEmitter.emit('start', options);

    var sourceDir = path.join(process.cwd(), options.localDir);
    var files = getAllFiles(sourceDir);
    if (!files) return;

    var counter = 0;
    var uploadedFileDetails = [];
    async.auto({

        remoteETagsByKeys: function (cb) {
          var s3 = createS3();
          s3.listObjects({ Bucket: options.bucket, Prefix: options.remoteDir }, function(err, data) {
            if (err) return cb(err);

            var eTagsByKeys = (data.Contents || []).reduce(function (keys, item) {
              keys[item.Key] = item.ETag;
              return keys;
            }, {});

            cb(null, eTagsByKeys);
          });
        },

        maintenanceFilesInfo: function (cb) {
            cb(null, getMaintenanceFilesInfo(sourceDir, files));
        },

        setMaintenanceStub: ['remoteETagsByKeys', 'maintenanceFilesInfo', function (cb, results) {
            if (results.maintenanceFilesInfo) {
                uploadFile(results.maintenanceFilesInfo.stubFileInfo, cb);
            } else {
                cb(null);
            }
        }],

        uploadFiles: ['setMaintenanceStub', function (cb, results) {

            async.eachLimit(files, options.maxAsyncStreams, function (file, eachCb) {

                if (results.maintenanceFilesInfo && file === results.maintenanceFilesInfo.originalFileInfo) {
                    return eachCb(null, { skipped: true });
                }

                uploadFile(file, function (err, details) {
                    counter++;

                    if (!err) {
                        var percent = Number(counter/files.length*100);
                        uploadedFileDetails.push(details);
                        eventEmitter.emit('upload', file, percent, details);
                    }

                    eachCb(err, details);
                });

            }, cb);

        }],

        removeMaintenanceStub: ['uploadFiles', function (cb, results) {
            if (results.maintenanceFilesInfo) {
                var file = results.maintenanceFilesInfo.originalFileInfo;

                uploadFile(file, function (err, details) {
                    counter++;

                    if (!err) {
                        var percent = Number(counter/files.length*100);
                        uploadedFileDetails.push(details);
                        eventEmitter.emit('upload', file, percent, details);
                    }

                    cb(err, details);
                });
            } else {
                cb(null);
            }
        }],

        invalidateCloudFrontCache: ['removeMaintenanceStub', function (cb, results) {
          if (!options.cloudFrontDistribution) {
            return cb(null);
          }

          var cloudFront = createCloudfront();

          var invalidatedPaths = uploadedFileDetails.reduce(function (paths, detail) {
            var remoteETag = results.remoteETagsByKeys[detail.Key];
            var isChanged = !!remoteETag && remoteETag !== detail.ETag;

            if (isChanged) {
              paths.push('/' + detail.Key);
            }

            return paths;
          }, []);

          if (!invalidatedPaths.length) {
            return cb(null);
          }

          cloudFront.createInvalidation({
            DistributionId: options.cloudFrontDistribution,
            InvalidationBatch: {
              CallerReference: Date.now().toString(),
              Paths: {
                Quantity: invalidatedPaths.length,
                Items: invalidatedPaths
              }
            }
          }, function (err, res) {
            if (err) return cb(err);
            console.log('CloudFront invalidation created: ' + res.Invalidation.Id);
            cb(null, res);
          });

        }]

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

