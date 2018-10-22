var request = require('request'),
	util = require('util'),
        querystring = require('querystring');

module.exports = function ProxmoxApi(hostname, user, password, realm, port){
	// INIT vars
	this.token = {};
	this.tokenTimestamp = 0;
	this.hostname = hostname;
	if(!realm && !password && !port) {//called with just hostname and may be port
		this.port = (user === undefined ? 8006 : user);
	} else { 
		this.user = user;
		this.password = password;
		this.realm = realm;
		this.port = (port === undefined ? 8006 : port);
	}

	function logout() //any other calls ater this will fail
	{
		this.token = {};
		this.tokenTimestamp = 0;
		this.user     = '';
		this.password = '';
		this.realm    = '';
	}

    function login(hostname, user, realm, password, callback)
	{		
		var querystring = require('querystring');
		body = { password: password, username: user, realm: realm };
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
		var req = http.request(options, function(res) {
			res.setEncoding('utf8');
		    res.on('data', function (chunk) {
				if (res.statusCode != 200) {	//Error handling
					var err = new Error('http error ' + res.statusCode)
					if (typeof (callback) == 'function')
						callback(err);
				} else {
					var data = JSON.parse(chunk).data;
					par.token = {ticket: data.ticket, CSRFPreventionToken: data.CSRFPreventionToken};
					par.tokenTimestamp = new Date().getTime();	
					if(typeof(callback) == 'function')
						callback(null,data);
				}
		    });
		});
		req.write(body);
		req.on('error', function (err) {
			req.abort();
			return callback(err);
		});
		req.on('timeout', function () {
			req.abort();
			const err = new ("Connection timeout");
			return callback(err);
		});
		req.setTimeout(10000);
		req.end();
	}

	function call(method, url, body, callback)
	{
		currentTime = new Date().getTime();
		//1 hour login timeout
		if(currentTime - this.tokenTimestamp > 60 * 60 * 1000)
		{
			login(this.hostname, this.user, this.password, this.realm, function(err) {
				if(err) return callback(err);
				callApi(method, url, body, callback);
			});
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
			};
		}
		var options = {
			url: host + '/api2/json' + url,
			gzip: true,
			method: method,
			rejectUnauthorized: false, //Allow unauthorized SSL certificate
			headers: headers
                };

                if(method.toLowerCase() == 'put' || method.toLowerCase() == 'post') {
                    options['body'] = querystring.stringify(body); 
                }

		request(options, (err, response, body) => {
			if (!err && response.statusCode == 200) {
				var info = JSON.parse(body);
				return callback(null,info);
			} else {
				if(err)
					return callback(err);
				else {
					const error = new Error('http error ' + response.statusCode);
					return callback(error);
				}
			}
		});
	}

	function credlogin(user, password, realm, callback)
	{
		this.user = user;
		this.password = password;
		this.realm = realm;
		login(this.hostname, user, password, realm, callback);
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
		},
		login: function _login(user, password, realm, callback) {
			credlogin(user, realm, password, callback);
		},
		logout: function _logout() {
			logout();
		}
	}
}
