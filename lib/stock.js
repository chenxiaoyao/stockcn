var fs = require('fs'),
    path = require('path'),
    request = require('request'),
    Q = require('q'),
    iconv = require('iconv-lite'),
    colors = require('colors'),
    util = require('util');

var hk_rmb_rate = 0.784276401;

module.exports = {};

var requestMarketUrl = 'http://qt.gtimg.cn/q=';
var requestInfoUrl = 'http://data.stock.hexun.com/include/ajax_search.aspx?key=';

module.exports.groups = function() {
    var groupNames = Object.keys(parseInnerStockInfos(false));
    var info = 'Availabel groups: \n';
    groupNames.forEach(function(name) {
        info += (name.green + '\n');
    });
    console.log(info);
};

module.exports.list = function(groupName) {
    !groupName && (groupName = 'all');
    groupName = groupName.toLowerCase();
    var stocks = [];
    var stockJson;
    if(groupName == 'all') {
        stockJson = parseInnerStockInfos(true);
    } else {
        stockJson = parseInnerStockInfos(false)[groupName];
    }
    if(!stockJson) {
        console.log('Can not recognize group name "' + groupName + '".');
        return;
    }
    listStocks(getStockCodes(stockJson))
    .fail(function(err) {
        console.log(err);
        throw err;
    });
};

function getStockCodes(stockJson) {
    return Object.keys(stockJson).map(function(key) {
        return stockJson[key];
    });
}

module.exports.show = function(opts) {
    if(!opts) {
        console.log('You must input stock code or ping yin as parameter.');
        return;
    }
    var tokens = opts;
    var codes = [];
    tokens.reduce(function(soFar, token) {
        return soFar.then(function() {
            if(/\d+/.test(token)) {
                codes.push(token);
            } else {
                if(!/[a-zA-Z]/.test(token)) {
                    console.log('PingYin of stock "' + token + '" is not correct, igore it.');
                    return;
                }
                var pingyin = token.toLowerCase();
                return getCodesByPingYin(pingyin)
                .then(function(results) {
                    codes = codes.concat(results);
                });
            }
        });
    }, Q())
    .then(function() {
        return listStocks(codes);
    })
    .fail(function(err) {
        console.log(err);
        throw err;
    });
};

function listStocks(stockCodes) {
    var queryCodes = stockCodes.map(function(c) {
        return resolveQueryCode(c);
    });
    return query(queryCodes)
    .then(function(response) {
        return parseResponseData(response);
    })
    .then(function(stockInfos) {
        showStocks(stockInfos);
    });
}

function getCodesByPingYin(pingyin) {
    var d = Q.defer();
    var opt = {
        url : requestInfoUrl + pingyin,
        encoding : null
    };
    request(opt, function (error, response, body) {
        var statusCode = response.statusCode;
        if(error) {
            d.reject(error);
        } else if(statusCode != 200) {
            d.reject(new Error('Response code: ' + response.statusCode));
        } else {
            var str = iconv.decode(body, 'gbk');
            var expr = /.*=\s*"(\d+)-.*?";/gm;
            var result, codes = [];
            while((result = expr.exec(str))) {
                codes.push(result[1]);
            }
            d.resolve(codes);
        }
    });
    return d.promise;
}

function query(queryCodes) {
    var paramStr = queryCodes.join(',');
    var d = Q.defer();
    var opt = {
        url : requestMarketUrl + paramStr,
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
    var expr = /v_([a-z]{2})(\d+).*="(.*)";/gm;
    var result, stockInfos = [];
    while((result = expr.exec(response))) {
        var values = result[3].split('~');
        var stockInfo = {
            'name' : values[1],
            'price' : values[3],
            'upgrade' : values[32],
            'high' : values[33],
            'low' : values[34],
            'pe' : values[39],
            'value' : result[1] == 'hk' ? values[44] : values[45],
            'pb' : values[46]
        };
        stockInfo.code = result[1] + result[2];
        if(result[1] == 'hk') {
            stockInfo.price = hkDollarToRMB(stockInfo.price);
            stockInfo.high = hkDollarToRMB(stockInfo.high);
            stockInfo.low = hkDollarToRMB(stockInfo.low);
            stockInfo.value = hkDollarToRMB(stockInfo.value);
            stockInfo.pb = 'N/A';
            stockInfo.market = '香港';
        } else {
            stockInfo.market = (result[1] == 'sh' ? '上海' : '深圳');
        }
        stockInfo.value = stockInfo.value + '亿';
        stockInfos.push(stockInfo);
    }
    return Q(stockInfos);
}

function hkDollarToRMB(dollar) {
    if(typeof dollar != 'number') {
        dollar = parseFloat(dollar);
    }
    dollar = String(hk_rmb_rate * dollar);
    var dotIndex = dollar.indexOf('.'),
        end = Math.min(dotIndex + 3, dollar.length);
    return dollar.slice(0, end);
}

function showStocks(stockInfos) {
    var title = util.format('%s %s(%s/%s) %s %s %s %s', format('Name/Code', 20), format('Price', 6),
        format('High', 6), format('Low', 6), format('Growth', 8), format('PE', 8), format('PB', 6), format('Value', 9));
    console.log(title);
    stockInfos.forEach(function(stockInfo) {
        var upgrade = stockInfo.upgrade + '%';
        upgrade = format(upgrade, 8);
        upgrade = upgrade.trim().slice(0, 1) == '-' ? upgrade.green : upgrade.red;
        var pbStr = stockInfo.pb,
            pb = parseFloat(pbStr);
        pbStr = format(pbStr, 6);
        if(pb < 3.0) {
            pbStr = pbStr.yellow;
        }
        var info = util.format('%s(%s)     %s(%s/%s) %s %s %s %s', format(stockInfo.name, 6), format(stockInfo.code, 8),
            format(stockInfo.price, 6).yellow, format(stockInfo.high, 6).red, format(stockInfo.low, 6).green,
            upgrade, format(stockInfo.pe, 8), pbStr, format(stockInfo.value, 9));
        console.log(info);
    });
}

function format(str, len) {
    var spaceStr = '                                                               ';
    if(str.length >= len) {
        return str;
    }
    return spaceStr.slice(0, (len - str.length)) + str;
}

function resolveQueryCode(code) {
    if(code.length == 6) {
        // '11', '12'开头为转债
        if(code.slice(0, 2) == '11' || code.slice(0, 1) == '6') {
            return 'sh' + code;
        } else if(code.slice(0, 2) == '12') {
            return 'sz' + code;
        } else {
            return 'sz' + code;
        }
    } else if(code.length < 6) {
        return 'hk' + code;
    } else {
        return null;
    }
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
