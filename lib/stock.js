var fs = require('fs'),
    path = require('path'),
    request = require('request'),
    Q = require('q'),
    iconv = require('iconv-lite'),
    colors = require('colors');
module.exports = {};

var requestUrl = 'http://qt.gtimg.cn/q=';

module.exports.list = function() {
    var stocks = parseInnerStockInfos(true);
    Object.keys(stocks).reduce(function(soFar, key) {
        return soFar.then(function() {
            var queryCode = resolveQueryCode(stocks[key]);
            return query(queryCode)
            .then(function(response) {
                return parseResponseData(response);
            })
            .then(function(stockInfo) {
                showStock(stockInfo);
            });
        });
    }, Q())
    .fail(function(err) {
        console.log(err);
        throw err;
    });
};

module.exports.show = function(targets) {

}

function query(queryCode) {
    var d = Q.defer();
    var opt = {
        url : requestUrl + queryCode,
        encoding : null
    };
    request(opt, function (error, response, body) {
        var statusCode = response.statusCode;
        if(error) {
            d.reject(error);
        } else if(statusCode != 200) {
            d.reject(new Error('Response code: ' + response.statusCode));
        } else {
            d.resolve(iconv.decode(body, 'gbk'));
        }
    });
    return d.promise;
}

function parseResponseData(response) {
    var matchData = response.match(/.*="(.*)";/);
    if(!matchData || !matchData[1]) {
        return Q.reject(new Error('Can not parse response data "' + response + '".'));
    }
    var values = matchData[1].split('~');
    var stockInfo = {
        'name' : values[1],
        'price' : values[3],
        'upgrade' : values[32],
        'pe' : values[39],
        'value' : values[45],
        'pb' : values[46]
    };
    return Q(stockInfo);
}

function showStock(stockInfo) {
    var upgrade = stockInfo.upgrade + '%';
    upgrade = upgrade.slice(0, 1) == '-' ? upgrade.green : upgrade.red;
    var info = 'name: ' + stockInfo.name + ' price: ' + (stockInfo.price.yellow) + ' upgrade: ' + upgrade
        + ' pe: ' + stockInfo.pe + ' pb: ' + stockInfo.pb + ' value: ' + stockInfo.value;
    console.log(info);
}

function resolveQueryCode(code) {
    return code.slice(0, 1) == '6' ? 'sh' + code : 'sz' + code;
}

function parseInnerStockInfos(flatten) {
    var info = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf-8'));
    if(!flatten) return info;

    var flattened = {};
    Object.keys(info).forEach(function(groupName) {
        var group = info[groupName];
        Object.keys(group).forEach(function(key) {
            flattened[key] = group[key];
        });
    });
    return flattened;
}
