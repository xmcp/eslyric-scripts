// xmcp modified to fix glitches and refactored against eslyric v0.5 api

/**
 * Created by cimoc on 2016/12/23
 * Netease Cloud Music Lyric Source For ESLyric
 * version : 0.1.2 b6
 * 感谢 ChowDPa02K,Jeannela\Elia, 不知名的的api提供者
 * 页面 : https://github.com/cimoc-sokka/Some-js-script-for-FB2K
 * 下载 : https://github.com/cimoc-sokka/Some-js-script-for-FB2K/releases
 * cimoc的邮箱 : cimoc@sokka.cn
 */

//搜索歌词数,如果经常搜不到试着改小或改大
var limit = 4;

//更改或删除翻译外括号
//提供一些括号〔 〕〈 〉《 》「 」『 』〖 〗【 】( ) [ ] { }
var bracket = [
    "「", //左括号
    "」"  //右括号
];

//new_merge歌词翻译时间轴滞后秒数，防闪
var timefix = 0;
//当timefix有效时设置offset(毫秒),防闪
var offset=0;


var debug = false;
export function getConfig(cfg) {
    cfg.name = "网易云音乐（旧）";
    cfg.version = "0.1.2 b6";
    cfg.author = "cimoc, xmcp";
    cfg.useRawMeta = false;
}

export function getLyrics(info, callback) {
    var searchURL, lyricURL;
    var tranlrc='';
    var MY_NAME='网易云音乐（旧）';

    var title = info.title;
    var artist = info.artist;
    //搜索
    var s = artist ? (title + "-" + artist) : title;
    //searchURL = "http://music.163.com/api/search/get/web?csrf_token=";//如果下面的没用,试试改成这句
    searchURL = "http://music.163.com/api/search/get/";
    var post_data = 'hlpretag=<span class="s-fc7">&hlposttag=</span>&s=' + encodeURIComponent(s) + '&type=1&offset=0&total=true&limit=' + limit;
    
    var newLyric = callback.createLyric();
    
    request({
        url: searchURL,
        method: "POST",
        headers: {
            "Origin": "http://music.163.com",
            "User-Agent": "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.90 Safari/537.36",
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": "http://music.163.com/search/",
            "Connection": "Close",
        },
        body: post_data,
    }, function(err, res, body) {
        if (!err && res.statusCode == 200) {
            //  console.log(body);
            var ncm_back = JSON.parse(body);
            var result = ncm_back.result;
            if (ncm_back.code != 200 || !result.songCount) {
                debug && console.log("get info failed");
                return false;
            }
            //筛选曲名及艺术家
            var song = result.songs;
            var out = [0, 0];
            var b = 0;
            var c = 0;
            for (var k in song) {
                var ncm_name = song[k].name;
                for (var a_k in song[k].artists) {
                    var ncm_artist = song[k].artists[a_k].name;
                    var p0 = compare(title, ncm_name);
                    var p1 = compare(artist, ncm_artist);
                    if (p0 == 100 && p1 == 100) {
                        b = k;
                        c = a_k;
                        out[0] = p0;
                        out[1] = p1;
                        break;
                    }
                    if (p0 > out[0]) {
                        b = k;
                        c = a_k;
                        out[0] = p0;
                    } else {
                        if (!artist && (p0 == out[0] && p1 > out[1])) {
                            b = k;
                            c = a_k;
                            out[1] = p1;
                        }
                    }
                }
            }
            var res_id = song[b].id;
            var res_name = song[b].name;
            var res_album = (song[b].album || {name: ''}).name;
            var res_artist = song[b].artists[c].name;
            debug && console.log(res_id + "-" + res_name + "-" + res_artist);
            
            //获取歌词
            lyricURL = "http://music.163.com/api/song/lyric?os=pc&id=" + res_id + "&lv=-1&kv=-1&tv=-1";

            request({
                url: lyricURL,
                method: "GET",
                headers: {
                    "Cookie": "appver=1.5.0.75771",
                    "Referer": "http://music.163.com/",
                    "Connection": "Close",
                },
            }, function(err, res, body) {
                //添加歌词
                if (!err && res.statusCode == 200) {
                    var ncm_lrc = JSON.parse(body);
                    var issettran = 0;
                    var issetlrc = 0;
                    if (!ncm_lrc.lrc) return false;
                    if (ncm_lrc.tlyric && ncm_lrc.tlyric.lyric) {
                        tranlrc = ncm_lrc.tlyric.lyric.replace(/(〔|〕|〈|〉|《|》|「|」|『|』|〖|〗|【|】|{|}|\/)/g, "");
                        issettran = 1;
                    } else debug && console.log("no translation");
                    if (ncm_lrc.lrc.lyric) {
                        issetlrc = 1;
                    } else debug && console.log("no lyric");
                    
                    if (issetlrc) {
                        newLyric.lyricText = remove_leading_space(ncm_lrc.lrc.lyric);
                        if(issettran) {
                            newLyric.lyricText += '\n' + remove_header_and_empty_line(tranlrc);
                        }
                        newLyric.title = res_name;
                        newLyric.artist = res_artist;
                        newLyric.album = res_album;
                        //newLyric.album = info.rawAlbum;
                        callback.addLyric(newLyric);
                    }
                }
            });
        }
    });
}


function compare(x, y) {
    x = x.split("");
    y = y.split("");
    var z = 0;
    var s = x.length + y.length;


    x.sort();
    y.sort();
    var a = x.shift();
    var b = y.shift();

    while (a !== undefined && b !== undefined) {
        if (a === b) {
            z++;
            a = x.shift();
            b = y.shift();
        } else if (a < b) {
            a = x.shift();
        } else if (a > b) {
            b = y.shift();
        }
    }
    return z / s * 200;
}

function remove_leading_space(s) {
    return s.split(/[\r\n]/).map((l)=>{
        return l.replace('] ', ']');
    }).join('\n');
}

function remove_header_and_empty_line(s) {
    return s.split(/[\r\n]/).filter((l)=>{
        if(!l)
            return false;
        if((/^\[[a-z]+:/.test(l)))
            return false;
        if(/^\[.+\]$/.test(l))
            return false;
        return true;
    }).join('\n');
}