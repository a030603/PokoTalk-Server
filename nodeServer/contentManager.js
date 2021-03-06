/** Content manager is managing all media contents other than text, such as images, files.
 *  Users can upload and download contents interacting with content manager events */
const rbTree = require('./RBTree');
const dbManager = require('./dbManager');
const fs = require('fs');
const crypto = require('crypto');

const uploadJobs = rbTree.createRBTree();
const downloadJobs = rbTree.createRBTree();

var uploadId = 1;
var downloadId = 1;

const uploadJobTimeout = 5000;
const downloadJobTimeout = 5000;

const downloadChunkSize = 2 * 1024 * 1024;
const downloadWindowSize = 2 * 1024 * 1024;

// Content type configuration
const contentType = {
	image: {
		exts: ['jpeg', 'jpg', 'png'],
		dir: './imageContents',
		maximumSize: 1024 * 1024 * 10
	},
	binary: {
		exts: ['*',],
		dir: './binaryContents',
		maximumSize: 1024 * 1024 * 200
	}
};

const types = {
	image: 'image',
	binary: 'binary'
}

var init = function(user) {
	// Add user job list
	user.uploadJobs = [];
	user.downloadJobs = [];
	
	user.on('startUpload', function(data) {
		if (!session.validateRequest('startUpload', user, true, data)) {
			return;
		}
		
		var uploadId = parseInt(data.uploadId);
		var size = parseInt(data.size);
		var ext = data.extension;
		
		lib.debug('start upload id ' + uploadId + ' size, ' + size);
		
		// id and size should be integer
		if (uploadId !== uploadId || size !== size || typeof(ext) != 'string') {
			return user.emitter.pushEvent('startUpload', 
					{status:'fail', errorMsg: 'invalid input'}).fireEvent();
		}
		
		// Get job
		var job = uploadJobs.get(uploadId);
		
		// Job should exist
		if (!job) {
			return user.emitter.pushEvent('startUpload', 
					{status:'fail', errorMsg: 'invalid id'}).fireEvent();
		}
		
		// The user should match
		if (job.user != user) {
			return user.emitter.pushEvent('startUpload', 
					{status:'fail', errorMsg: 'authorization failed'}).fireEvent();
		}
		
		// Set content size
		job.size = size;
		job.left = size;
		
		// Create upload file name
		var contentName = crypto.randomBytes(8).toString('hex');
		
		// Get type of content file
		var typeStr = job.contentType;
		var type = contentType[typeStr];
		
		if (!type) {
			return user.emitter.pushEvent('startUpload', 
					{status:'fail', errorMsg: 'server error'}).fireEvent();
		}
		
		var dir = type.dir;
		var exts = type.exts;
		var maximumSize = type.maximumSize;
		
		// Check if extension is valid
		if (exts.indexOf('*') < 0 && exts.indexOf(ext) < 0) {
			return user.emitter.pushEvent('startUpload', 
					{status:'fail', errorMsg: 'invalid extension'}).fireEvent();
		}
		
		// Check if file size is too big
		if (size > maximumSize) {
			return user.emitter.pushEvent('startUpload', 
					{status:'fail', errorMsg: 'size is too big'}).fireEvent();
		}
		
		// Add extension to content name
		contentName += '.' + ext;
		
		async.waterfall([
			function(callback) {
				// Make sure directory exists
				fs.stat(dir, function(err, stats) {
					if (err) {
						// Create directory
						fs.mkdir(dir, function(err) {
							callback(err);
						});
					} else {
						if (stats.isDirectory()) {
							// Directory exists
							callback(null);
						} else {
							callback(new Error('Failed to initialize'));
						}
					}
				});
			},
			function(callback) {
				// Set file path
				job.path = dir + '/' + contentName;
				
				// Create file
				fs.open(job.path, 'wx', callback);
			},
			function(fd, callback) {
				// Set file descriptor
				job.file = fd;
				job.contentName = contentName;
				
				lib.debug('upload file descriptor ' + fd);
				
				callback(null);
			}
		],
		function(err) {
			// Clear timer
			if (job.timer) {
				clearTimeout(job.timer);
			}
			
			// Set timer again
			job.timer = setTimeout(function() {
				job.finish(new Error('Timeout'));
			}, uploadJobTimeout);
			
			if (err) {
				lib.debug(err);
				user.emitter.pushEvent('startUpload', 
						{status: 'fail', errorMsg: 'server erorr', uploadId: uploadId}).fireEvent();
				
				// Finish job
				job.finish(err);
			} else {
				// From now on user can upload data;
				user.emitter.pushEvent('startUpload', 
						{status:'success', uploadId: uploadId, contentName: job.contentName}).fireEvent();
			}
		});
	});
	
	user.on('upload', function(data) {
		if (!session.validateRequest('upload', user, true, data))
			return;
		
		// Get user input
		var uploadId = parseInt(data.uploadId);
		var buf = data.buf;
		
		// Check data validity
		if (uploadId !== uploadId || !buf) {
			return user.emitter.pushEvent('upload', 
					{status:'fail', errorMsg: 'invalid input'}).fireEvent();
		}
		
		// Get job
		var job = uploadJobs.get(uploadId);
		
		// Job should exist
		if (!job) {
			return;
		}
		
		// Check if the job is done
		if (job.done) {
			return user.emitter.pushEvent('upload', 
					{status:'fail', errorMsg: 'upload closed'}).fireEvent();
		}
		
		// The user should match
		if (job.user != user) {
			return user.emitter.pushEvent('upload', 
					{status:'fail', errorMsg: 'authorization failed'}).fireEvent();
		}
	
		var file = job.file;
		
		if (!file) {
			return user.emitter.pushEvent('upload', 
					{status:'fail', errorMsg: 'emit startUpload event first'}).fireEvent();
		}
		
		if (job.left <= 0) {
			return user.emitter.pushEvent('upload', 
					{status:'fail', errorMsg: 'too many bytes'}).fireEvent();
		}
		
		// Compute valid size of upload
		var bufSize = buf.length;
		var leftSize = job.left;
		var validSize = leftSize < bufSize ? leftSize : bufSize;
		
		// Cut buffer if buffer size is too big
		if (leftSize < bufSize) {
			buf = buf.slice(0, validSize);
		}
		
		// Subtract left size
		job.left -= validSize;
		
		// Write to file
		fs.write(file, buf, function(writeErr) {
			// Clear timer
			if (job.timer) {
				clearTimeout(job.timer);
			}
			
			// Set timer again
			job.timer = setTimeout(function() {
				job.finish(new Error('Timeout'));
			}, uploadJobTimeout);
			
			// Emit message
			if (writeErr) {
				lib.debug(writeErr);
				user.emitter.pushEvent('upload', 
						{status:'fail', errorMsg: 'failed to write', uploadId: uploadId}).fireEvent();
			} else {
				// Increment written size
				job.written += validSize;
				
				user.emitter.pushEvent('upload', 
						{status:'success', uploadId: uploadId, ack: job.size - job.left}).fireEvent();
			}
			
			// If the job is not done
			if (!job.done) {
				// Check if i is an error
				if (writeErr) {
					// Mark job done
					job.markDone();
					
					// Finish upload job
					job.finish(writeErr);
				}
				// Check if job is done
				else if (job.written == job.size) {
					// Mark job done
					job.markDone();
					
					if (job.contentType == types.image) {
						// Create thumbnail image
						image.createThumbnailImage(job.contentName, function(err) {
							if (err) {
								lib.debug(err);
							} else {
								lib.debug('created thumbnail image');
							}
							
							// Finish upload job
							job.finish(null);
						});
					} else {
						// Finish upload job
						job.finish(null);
					}
				}
			}
		})
	});
	
	user.on('startDownload', function(data) {
		if (!session.validateRequest('startDownload', user, true, data))
			return;
	
		var contentName = data.contentName;
		var typeStr = data.type;
		var sendId = parseInt(data.sendId);
		
		if (!contentName || !typeStr || sendId !== sendId
				|| typeof(contentName) != 'string' || typeof(typeStr) != 'string') {
			return user.emitter.pushEvent('startDownload', 
					{status:'fail', errorMsg: 'invalid input'}).fireEvent();
		}
		
		lib.debug('start downlaod ' +contentName + ' sendId ' + sendId + ' type ' + typeStr);
		
		var path;
		var type = contentType[typeStr];
		
		if (!type) {
			return user.emitter.pushEvent('startDownload', 
					{status:'fail', errorMsg: 'invalid type'}).fireEvent();
		}
		
		// Get extensions
		var exts = type.exts;
		
		// Content extension must match
		var split = contentName.split('.');
		
		if (split.length > 1) {
			if (exts.indexOf('*') < 0 && exts.indexOf(split[split.length - 1]) < 0) {
				return user.emitter.pushEvent('startDownload', 
						{status:'fail', errorMsg: 'invalid extension'}).fireEvent();
			}
		}
		
		if (type) {
			path = type.dir + '/' + contentName;
		} else {
			return user.emitter.pushEvent('startDownload', 
					{status:'fail', errorMsg: 'invalid type'}).fireEvent();
		}
		
		var job, file, size;
		
		// Open file
		async.waterfall([
			function(callback) {
				// Open file
				fs.open(path, 'r', callback);
			},
			function(fd, callback) {
				file = fd;
				
				// Get file stats
				fs.fstat(fd, callback);
			},
			function(stat, callback) {
				if (!stat.isFile()) {
					return callback(new Error('content is not a file'));
				}
				
				lib.debug('content exsits');
				
				// Get file size
				size = stat.size;
				
				// Make new download id
				var id = downloadId++;
			
				// Create download job
				job = new downloadJob(user, id, contentName, typeStr, file);
				job.size = size;
				job.sendId = sendId;
				
				// Add to global upload jobs
				if (downloadJobs.add(id, job)) {
					
					// Add to user download jobs
					user.downloadJobs.push(job);
					
					callback(null);
				} else {
					callback(new Error('job creation error'));
				}
			}
		], 
		function(err) {
			if (err) {
				lib.debug(err);
				user.emitter.pushEvent('startDownload', 
						{status:'fail', errorMsg: 'content error', sendId: sendId}).fireEvent();
				
				// Close file if opened
				if (file) {
					fs.close(file, function(err) {
						lib.debug(err);
					});
				}
				
				// Remove job from list
				if (job && job.id) {
					downloadJobs.remove(job.id);
					user.downloadJobs = user.downloadJobs.filter(function(value, index, arr) {
						return value != job;
					});
				}
			} else {
				// Emit the user job id and size
				user.emitter.pushEvent('startDownload', 
						{status:'success', downloadId: job.id, sendId: sendId, size: job.size}).fireEvent();
				
				// Create timer
				job.timer = setTimeout(function() {
					job.finish(new Error('Timeout'));
				}, downloadJobTimeout);
				
				// Start reading file
				job.sendChunksIfPossible()
			}
		});
	});
	
	user.on('downloadAck', function(data) {
		if (!session.validateRequest('downloadAck', user, true, data))
			return;
		
		// Parse user input
		var downloadId = parseInt(data.downloadId);
		var ack = parseInt(data.ack);
		
		// Validate user input
		if (downloadId !== downloadId || ack !== ack) {
			return user.emitter.pushEvent('downloadAck', 
					{status:'fail', errorMsg: 'invalid input'}).fireEvent();
		}
		
		// Get job
		var job = downloadJobs.get(downloadId);
		
		// Job must exist
		if (!job) {
			
			return user.emitter.pushEvent('downloadAck', 
					{status:'fail', errorMsg: 'no such job'}).fireEvent();
		}
		
		// The user should match
		if (job.user != user) {
			return user.emitter.pushEvent('downloadAck', 
					{status:'fail', errorMsg: 'authorization failed'}).fireEvent();
		}
		
		// Update job size
		job.doneSize = Math.max(job.doneSize, ack);
		
		// Clear timer
		if (job.timer) {
			clearTimeout(job.timer);
		}
		
		// Create timer
		job.timer = setTimeout(function() {
			job.finish(new Error('Timeout'));
		}, downloadJobTimeout);
		
		// Send more data if needed
		if (job.doneSize >= job.size) {
			// Done, remove job
			job.finish(null);
		} else {	
			// Send more data if possible
			job.sendChunksIfPossible();
		}
	});
};


var uploadJobProto = {
	user: null,			// user
	id: null,			// Job id
	done: false, 	   	// Done
	contentName: null,	// File name
	contentType: null,	// Content type
	path: null,			// File path
	size: null,			// Total size of content
	left: null,			// Size of content not delivered yet
	written: 0,			// Size of content written to file
	file: null,			// File
	callback: null,		// Callback function
	timer: null, 		// Timeout callback
	markDone: function() {
		this.done = true;
	}
};

var downloadJobProto = {
	user: null,			// user
	id: null,			// Job id
	done: false,		// Done
	sendId: null,		// Send id
	contentName: null,	// File name
	contentType: null,	// Content type
	size: null,			// Total size of content
	sendSize: 0,		// Transferred size of content by server
	doneSize: 0,		// Size of content acked by user
	file: null,			// File
	timer: null, 		// Timeout callback
	markDone: function() {
		this.done = true;
	}
};

var uploadJob = function(user, id, type, callback) {
	this.user = user;
	this.id = id;
	this.contentType = type;
	this.callback = callback;
	
	this.finish = function(givenError) {
		var job = this;
		
		lib.debug('Finish content ' + job.contentName + ' upload');
		
		// Mark job done
		this.markDone();
		
		if (givenError){
			lib.debug(givenError);
		}
		
		// Done, remove the job
		uploadJobs.remove(job.id);
		
		// Remove from user job list
		if (job.user) {
			job.user.uploadJobs = job.user.uploadJobs.filter(function(value, index, arr) {
				return value != job;
			});
		}
		
		// Call callback function
		if (job.callback) {
			setTimeout(function() {
				job.callback(givenError, job.contentName);
			}, 0);
		}
		
		// Cancel timer
		if (job.timer) {
			clearTimeout(job.timer);
			job.timer = null;
		}
		
		lib.debug('clear timer');
		
		if (job.file) {
			// Close file
			fs.close(job.file, function(err) {
				if (err) {
					lib.debug(err);
				}

				// If error occurred, remove the file
				if (givenError) {
					fs.unlink(job.path, function(err) {
						if (err) {
							lib.debug(err);
						} 
						
						lib.debug('File ' + job.path + ' was deleted');
					});
				}
			});
		}
	}
};

var downloadJob = function(user, id, contentName, type, file, callback) {
	this.user = user;
	this.id = id;
	this.contentName = contentName;
	this.contentType = type;
	this.file = file;
	
	this.finish = function(givenError) {
		var job = this;
		
		lib.debug('Finish downlaod job ' + job.contentName);
		
		// Mark job done
		this.markDone();
		
		// Remove job from list
		downloadJobs.remove(job.id);
		if (job.user) {
			job.user.downloadJobs = job.user.downloadJobs.filter(function(value, index, arr) {
				return value != job;
			});
		}
		
		// Cancel timer
		if (job.timer) {
			clearTimeout(job.timer);
			job.timer = null;
		}
		
		if (job.file) {
			// Close file
			fs.close(job.file, function(err) {
				if (err) {
					lib.debug(err);
				}
				lib.debug('Closed file ' + job.contentName);
			});
		}
	}
	
	this.sendChunksIfPossible = function() {
		var job = this;
		
		// Check if we can not send more
		if (this.sendSize >= this.doneSize + downloadWindowSize) {
			return;
		}
		
		// Check if send is already scheduled
		if (!this.sendChunkJob) {
			// Schedule sending function
			this.sendChunkJob = setTimeout(function() {job.sendChunksFunc()}, 0);
		}
	};
	
	this.sendChunkJob = null;
	
	this.sendChunksFunc = function() {
		var job = this;
		
		// Check if the job is done
		if (job.done) {
			job.sendChunkJob = null;
			return;
		}
		
		// Check if we can not send more
		if (job.sendSize >= job.doneSize + downloadWindowSize) {
			job.sendChunkJob = null;
			return;
		}
		
		// Allocate buffer
		var buffer = Buffer.alloc(downloadChunkSize);
		
		fs.read(job.file, buffer, 0, downloadChunkSize, null, function(err, bytesRead, buf) {
			if (err) {
				// IO error
				user.emitter.pushEvent('download', 
						{status:'fail', errorMsg: 'file error', 
					downloadId: job.id, sendId: job.sendId}).fireEvent();
				
				// Remove send job
				job.sendChunkJob = null;
				
				// Finish download job
				job.finish(new Error('IO Error'));
			} else {
				if (bytesRead <= 0) {
					// Remove send job
					job.sendChunkJob = null;
					
					// Read all bytes, finish download job
					job.finish(null);
				} else {
					let sendBuffer;
					
					// Update send size
					job.sendSize += bytesRead;
					
					if (bytesRead < Buffer.length) {
						sendBuffer = buffer.slice(0, bytesRead);
					} else {
						sendBuffer = buffer;
					}
					
					//lib.debug('FIRST 10 bytes ' + buffer.slice(0, 10).toString('hex'));
					lib.debug('send ' + job.sendSize + ' bytes out of ' + job.size);
					//lib.debug('send buf size ' + sendBuffer.length);
					
					// Send bytes to user
					user.emitter.pushEvent('download', {status:'success', 
						downloadId: job.id, sendId: job.sendId, size: job.size, buffer: sendBuffer}).fireEvent();
					
					// Check if we can send more
					if (job.sendSize < job.doneSize + downloadWindowSize) {
						// Read next bytes
						job.sendChunkJob = setTimeout(function() {job.sendChunksFunc()}, 0);
					} else {
						// End send job
						job.sendChunkJob = null;
					}
				}
			}
		});
	};
};

uploadJob.prototype = uploadJobProto;
downloadJob.prototype = downloadJobProto;

var enrollUploadJob = function(user, type, jobCallback, callback) {
	// Make upload id
	var id = uploadId++;
	
	// Create upload job
	var job = new uploadJob(user, id, type, jobCallback);
	
	// Create timer
	job.timer = setTimeout(function() {
		job.finish(new Error('Timeout'));
	}, uploadJobTimeout);
	
	// Add upload job
	if (uploadJobs.add(job.id, job)) {
		if (callback) {
			callback(null, job.id);
		} else {
			return true;
		}
	} else if (callback) {
		callback(new Error("Duplicate upload job id"));
	} else {
		return false;
	}
};

var clearAllJobOfUser = function(user) {
	var userUploadJobs = user.uploadJobs;
	var userDownloadJobs = user.downloadJobs;
	
	if (userUploadJobs) {
		for (var i in userUploadJobs) {
			var job = userUploadJobs[i];
			uploadJobs.remove(job.id);
			if (job.file) {
				fs.close(job.file, function(err) {
					lib.debug(err);
				});
			}
		}
	}
	
	if (userDownloadJobs) {
		for (var i in userDownloadJobs) {
			var job = userDownloadJobs[i];
			downloadJobs.remove(job.id);
			if (job.file) {
				fs.close(job.file, function(err) {
					lib.debug(err);
				});
			}
		}
	}

	user.uploadJobs = null;
	user.downloadJobs = null;
};

module.exports = {init: init,
	contentType: contentType,
	types: types,
	enrollUploadJob: enrollUploadJob,
	clearAllJobOfUser: clearAllJobOfUser};

var session = require('./session');
var lib = require('./lib');
var async = require('async');
const image = require('./imageProcessor');