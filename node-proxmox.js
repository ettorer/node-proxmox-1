var request = require('request'),
	util = require('util');

module.exports = function ProxmoxApi(hostname, user, pve, password, port){
	// INIT vars
    this.hostname = hostname;
    this.user = user;
    this.password = pve;
    this.pve = password;
    this.token = {};
    this.tokenTimestamp = 0;
	this.port = (port === undefined ? 8006 : port);

    function login(hostname, user, pve, password, callback)
	{		
		var querystring = require('querystring');
		body = { password: password, username: user, realm: pve };
		body = querystring.stringify(body);
		var headers = {
			'Content-Type':'application/x-www-form-urlencoded',
			'Content-Length': Buffer.byteLength(body)
		};
		var options = {
			host: hostname,
			rejectUnauthorized: false, //Allow unauthorized SSL certificate
			port: this.port,
			path: '/api2/json/access/ticket',
			method: 'POST',
			headers: headers
		};
		var http = require('https');
		var par = this;
		var req = http.request(options, function(res){
			res.setEncoding('utf8');
		    res.on('data', function (chunk) {
		    	//Error handling to do
		    	var data = JSON.parse(chunk).data;
		        par.token = {ticket: data.ticket, CSRFPreventionToken: data.CSRFPreventionToken};
		    	par.tokenTimestamp = new Date().getTime();	
		    	if(typeof(callback) == 'function')
		    		callback();
		    });
		});
		req.write(body);
		req.end();
	}

	function call(method, url, body, callback)
	{
		currentTime = new Date().getTime();
		//1 hour login timeout
		if(currentTime - this.tokenTimestamp > 60 * 60 * 1000)
		{
			login(this.hostname, this.user, this.password, this.pve, function(){callApi(method, url, body, callback);});
		}
		else
		{
			callApi(method, url, body, callback);
		}
	}

	function getToken() {
		return this.token;
	}

	function callApi(method, url, body, callback)
	{
		var currentTime = new Date().getTime();	
		
		var querystring = require('querystring');
		var host = util.format('https://%s:%s', this.hostname, this.port);
		if(method == 'GET')
		{
			var headers = {
				'Cookie':'PVEAuthCookie='+this.token.ticket
			};
		}
		else {
			var headers = {
				'User-Agent': 'node-proxmox 0.1.3',
				'Cookie':'PVEAuthCookie='+this.token.ticket,
				'Origin': 'https://'+this.hostname+':'+this.port,
				'Content-Type':'application/x-www-form-urlencoded',
				'CSRFPreventionToken':this.token.CSRFPreventionToken,
				'Referer': host,
				'Content-Length': Buffer.byteLength(body),
			};
		}
		var options = {
			url: host + '/api2/json' + url,
			gzip: true,
			method: method,
			headers: headers
		};

		request(options, (err, response, body) => {
			if (!err && response.statusCode == 200) {
				var info = JSON.parse(body);
				return callback(info);
			}
		});


	}

return {
		get: function get(url, callback){
			call('GET', url, '', callback);
		},
		post: function post(url, body, callback){
			call('POST', url, body, callback);
		},
		put: function put(url, body, callback){
			call('PUT', url, body, callback);
		},
		del: function del(url, callback){
			call('DELETE', url, '', callback);
		},
		getToken: function _getToken() {
			return getToken();
		}
	}
}