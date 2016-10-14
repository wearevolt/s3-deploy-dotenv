# S3 Deploy Dotenv (S3D2) [![npm version](https://badge.fury.io/js/s3-deploy-dotenv.svg)](https://badge.fury.io/js/s3-deploy-dotenv)

This module provides a simple and fast way to upload data to the Amazon S3 by a single command using the values of the environment variables.
It enables compression on the fly for the selected file extensions.

### Install
```
npm install s3-deploy-dotenv
```

### Configure
Set environment variables or add to your `.env` file following parameters:
```
# S3 required options
S3_REGION=us-west-1
S3_ACCESS_KEY_ID=YOUR_S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY=YOUR_S3_SECRET_ACCESS_KEY
S3_BUCKET=S3_S3_BUCKET

# S3 optional, specified default values 
S3_DEFAULT_CONTENT_TYPE=application/octet-stream
S3_MAX_ASYNC_STREAMS=20
S3_UPLOAD_CONCURRENT_PARTS=5
S3_UPLOAD_MAX_PART_SIZE=20971520
S3_RETRY_COUNT=3
S3_RETRY_DELAY=1000
S3_MULTIPART_UPLOAD_THRESHOLD=20971520
S3_MULTIPART_UPLOAD_SIZE=15728640

# CloudFront
CLOUDFRONT_DISTRIBUTION=CLOUDFRONT_DISTRIBUTION_KEY

# Source directory, if empty use project root 
S3_LOCAL_DIR=dist

# Destination directory, if empty use bucket root 
S3_PREFIX=some/remote/dir/Keep_empty_if_root

# Gzip, optional, specified default values
S3_GZIP_EXTENSIONS=js,css,json
S3_GZIP_LEVEL=5

# Debug mode, optional
S3_DEBUG_MODE=true
```

### Use
As sample usage add to `scripts` section of `package.json` following command:
```
 "scripts": {
    "deploy": "s3-deploy-dotenv"
  }
```
Then run `deploy` command:
```
npm run deploy
```

### CloudFront cache invalidation
Set `CLOUDFRONT_DISTRIBUTION` for smart cache invalidation. Invalidation apply only for files with changed ETag.  

### Gzip content
Files with the extensions you specify will be compressed on the fly without the creation of additional temporary files on disk.

Each compressed file will be set header `Content-Encoding` to `gzip`.


```
S3_GZIP_EXTENSIONS=js,css,json
S3_GZIP_LEVEL=9
```

- `S3_GZIP_EXTENSIONS` file extensions that you want to compress. A comma-separated list, allowed space;
- `S3_GZIP_LEVEL` gzip compression level. Default value `5`;

### Show maintenance screen until uploading
If you need to show maintenance information until uploading files, use `S3_REPLACE_UNTIL_MAINTENANCE` parameter.
```
 S3_REPLACE_UNTIL_MAINTENANCE=[target_file],[stub_file]
```
Options `[target_file]` and `[stub_file]` is required.

For example:
```
 S3_REPLACE_UNTIL_MAINTENANCE=index.html,maintenance.html
```
Before start upload all other files, `maintenance.html` will be uploaded as `index.html`.
After all files uploading is done, content of `index.html` on server will be replaced with the original `index.html`.
 
Important note: extensions of target and stub files must be same avoid warning message:
```
  WARNING> Target and stub files should have same extensions!
```

### Security note
Always keep `.env` entry in your `.gitignore` file to avoid data leakage passwords and secret keys!
  
### TODO
* Unit tests
* Gzip minimal size
* Add ignored file extensions
* Any ideas? Request features [here](https://github.com/wearevolt/s3-deploy-dotenv/labels/enhancement) 

### Issues

Have a bug? Please create an issue here on GitHub!

[https://github.com/wearevolt/s3-deploy-dotenv/issues](https://github.com/wearevolt/s3-deploy-dotenv/issues)

### License

MIT 
 