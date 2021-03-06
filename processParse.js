var getReplayUrl = require('./getReplayUrl');
var request = require('request');
var updatePlayerCaches = require('./updatePlayerCaches');
var moment = require('moment');
module.exports = function processParse(job, ctx, cb) {
    var match_id = job.data.payload.match_id;
    var match = job.data.payload;
    console.time("parse " + match_id);
    if (match.start_time < moment().subtract(7, 'days').format('X') && !match.fileName && !(match.leagueid > 0)) {
        //expired, can't parse even if we have url, but parseable if we have a filename
        //TODO non-valve urls don't expire, we can try using them
        //TODO jobs with filename (submitted via kue) must have the file on the parse node!
        //TODO do we want to write parse_status:1 to db?  we should not overwrite existing parse_status:2
        console.log("replay too old, no filename and url expired");
        console.timeEnd("parse " + match_id);
        return cb();
    }
    //get the replay url, update db
    getReplayUrl(match, function(err) {
        if (err) {
            return cb(err);
        }
        else {
            //match object should now contain replay url, and url should be persisted to db
            console.log("[PARSER] parsing from %s", job.data.payload.url || job.data.payload.fileName);
            var url = job.data.payload.url;
            var fileName = job.data.payload.fileName;
            var target = job.parser_url + "&url=" + url + "&fileName=" + (fileName ? fileName : "");
            console.log("target: %s", target);
            request({
                url: target
            }, function(err, resp, body) {
                if (err || resp.statusCode !== 200 || !body) {
                    return cb(err || resp.statusCode || "http request error");
                }
                try {
                    body = JSON.parse(body);
                }
                catch (e) {
                    return cb(e);
                }
                if (body.error) {
                    return cb(body.error);
                }
                var parsed_data = body;
                match.match_id = match_id || parsed_data.match_id;
                match.parsed_data = parsed_data;
                match.parse_status = 2;
                //run aggregations on parsed data fields
                updatePlayerCaches(match, {
                    type: "parsed"
                }, function(err) {
                    console.timeEnd("parse " + match_id);
                    return cb(err);
                });
            });
        }
    });
};