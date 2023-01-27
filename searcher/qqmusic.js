import * as decoder from "parser_ext.so";

// xmcp: moved qrc parser here so that we can combine orig and trans lyrics

// BEGIN QRC

export function decodeQrc(buf) {
    var zipData = decoder.decodeQrc(buf);
    if (zipData == null) return;
    var unzipData = zlib.uncompress(zipData);
    if (unzipData == null) return;
    var lyricText = qrcToLrc(arrayBufferToString(unzipData));
    if (lyricText == null) return;
    return lyricText;
}

function escapeXml(xmlText)
{
    return xmlText.replace(/&/g, '&amp;');
}

function qrcToLrc(xmlText) {

    if (xmlText != null && typeof xmlText === 'string' && xmlText.indexOf('<?xml') == -1) {
        return xmlText;
    }

    var xmlRoot = mxml.loadString(xmlText);
    if (xmlRoot == null) {
        xmlText = escapeXml(xmlText);
        xmlRoot = mxml.loadString(xmlText);
    }
    if (xmlRoot == null) {
        console.log("parse xml failed: " + xmlText);
        return;
    }
    var lyricElement = xmlRoot.findElement("Lyric_1", mxml.MXML_DESCEND);
    if (lyricElement == null)
        return null;

    var lyricType = lyricElement.getAttr("LyricType");
    if (lyricType == null)
        return null;

    if (parseInt(lyricType) != 1) // unsupported type??? not sure
        return null;

    var qrcText = lyricElement.getAttr("LyricContent");
    if (qrcText == null)
        return null;

    var lyricText = "";
    var matches;
    var metaRegex = /^\[(\S+):(\S+)\]$/;
    var tsRegex = /^\[(\d+),(\d+)\](.*)$/;
    var ts2Regex = /(.*?)\((\d+),(\d+)\)/g;
    var lines = qrcText.split(/[\r\n]/);
    for (const line of lines) {
        if (matches = metaRegex.exec(line)) { // meta info
            lyricText += matches[0] + "\r\n";
        } else if (matches = tsRegex.exec(line)) {
            let lyricLine = "";
            let baseTime = parseInt(matches[1]);
            let duration = parseInt(matches[2]);
            const sentence = matches[3];
            lyricLine += "[" + formatTime(baseTime) + "]";
            lyricLine += "<" + formatTime(baseTime) + ">";
            // parse sub-timestamps
            let subMatches;
            
            //console.log(sentence);
            
            while (subMatches = ts2Regex.exec(sentence)) {
                var startTime = parseInt(subMatches[2]);
                let offset = parseInt(subMatches[3]);
                let subWord = subMatches[1];
                lyricLine += subWord + "<" + formatTime(startTime + offset) + ">";
            }
            lyricText += lyricLine + "\r\n";
        }
    }

    return lyricText;
}

function zpad(n) {
    var s = n.toString();
    return (s.length < 2) ? "0" + s : s;
}

function formatTime(time) {
    var t = Math.abs(time / 1000);
    var h = Math.floor(t / 3600);
    t -= h * 3600;
    var m = Math.floor(t / 60);
    t -= m * 60;
    var s = Math.floor(t);
    var ms = t - s;
    var str = (h ? zpad(h) + ":" : "") + zpad(m) + ":" + zpad(s) + "." + zpad(Math.floor(ms * 100));
    return str;
}

// END QRC

/*
 All credits to https://github.com/jsososo/QQMusicApi
                https://github.com/xmcp/QRCD
*/

export function getConfig(cfg) {
    cfg.name = "QQ音乐";
    cfg.version = "0.1";
    cfg.author = "ohyeah";
}

export function getLyrics(meta, man) {

    evalLib("querystring/querystring.min.js");

    // query QRC lyrics
    var url = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_search_pc_lrc.fcg?';
    var data = {
        SONGNAME: meta.title,
        SINGERNAME: meta.artist,
        TYPE: 2,
        RANGE_MIN: 1,
        RANGE_MAX: 20
    };
    url += querystring.stringify(data);

    var headers = {};
    headers['Referer'] = 'https://y.qq.com';

    let settings = {
        method: 'get',
        url: url,
        headers: headers
    };

    var stageSongList = [];
    request(settings, (err, res, body) => {
        if (err || res.statusCode != 200) {
            return;
        }
        var xml_doc = mxml.loadString(body);
        var song_list = xml_doc.findElement('songinfo') || [];
        for (const song of song_list) {
            var id = song.getAttr('id');
            if (id == null) continue;
            var title = decodeURIComponent(getChildElementCDATA(song, 'name').replace(/\+/g, ' '));
            var artist = decodeURIComponent(getChildElementCDATA(song, 'singername').replace(/\+/g, ' '));
            var album = decodeURIComponent(getChildElementCDATA(song, 'albumname').replace(/\+/g, ' '));

            stageSongList.push({ id: id, title: title, artist: artist, album: album });
        }

    });

    if (stageSongList.length > 0) {
        let lyricCount = queryLyricV3(meta, man, stageSongList);
        if (lyricCount == null || lyricCount < 1) {
            queryLyricV2(meta, man, stageSongList);
        }
    }

    // obsolete
    //queryLyric(meta, man);

}

function queryLyricV3(meta, man, songList)
{
    let lyricCount = 0;
    let headers = {};
    headers['Referer'] = 'https://y.qq.com';
    headers['Host'] = 'u.y.qq.com';
    // notes: some params may not be required, I'm not tested.
    let postData = {
        comm: {
            _channelid: '0',
            _os_version: '6.2.9200-2',
            authst: '',
            ct: '19',
            cv: '1873',
            //guid: '30D1D7C616938DDB575AF16E56D44BD4',
            patch: '118',
            psrf_access_token_expiresAt: 0,
            psrf_qqaccess_token: '',
            psrf_qqopenid: '',
            psrf_qqunionid: '',
            tmeAppID: 'qqmusic',
            tmeLoginType: 2,
            uin: '0',
            wid: '0'
        },
        'music.musichallSong.PlayLyricInfo.GetPlayLyricInfo': {
            method: 'GetPlayLyricInfo',
            module: 'music.musichallSong.PlayLyricInfo'
        }
    };

    for(const song of songList) {
        let songID = song.id | 0;
        postData['music.musichallSong.PlayLyricInfo.GetPlayLyricInfo']['param'] = {
            albumName : btoa(song.album),
            crypt : 1,
            ct : 19,
            cv : 1873,
            interval : meta.duration | 0,
            lrc_t : 0,
            qrc : 1,
            qrc_t : 0,
            roma : 1,
            roma_t : 0,
            singerName : btoa(song.album),
            songID : songID,
            songName : btoa(song.artist),
            trans : 1,
            trans_t : 0,
            type : -1
        }

        let url = 'https://u.y.qq.com/cgi-bin/musicu.fcg?';
        let params = {
            pcachetime: new Date().getTime() | 0
        }
        url += querystring.stringify(params);
        let postDataString = JSON.stringify(postData);
        let settings = {
            method: 'post',
            url: url,
            headers: headers,
            body: postDataString
        };
    
        request(settings, (err, res, body) => {
            if (err || res.statusCode != 200) {
                return;
            }
            
            try {
                let obj = JSON.parse(body);
                if (obj['code'] != 0) {
                    return;
                }

                let lyricObjRoot = obj['music.musichallSong.PlayLyricInfo.GetPlayLyricInfo'];
                if (lyricObjRoot['code'] != 0) {
                    return;
                }

                let lyricObj = lyricObjRoot['data'];
                if (lyricObj['songID'] != songID) {
                    return;
                }

                var lyricMeta = man.createLyric();
                let lyricText = restoreQrc(lyricObj['lyric']);
                if (lyricText == null) {
                    return;
                }
                
                if(lyricObj['trans']) {
                    let t = restoreQrc(lyricObj['trans']);
                    if(t!==null) {
                        lyricText += '\n' + fix_translation(t, lyricText);
                    }
                }

                lyricMeta.title = song.title;
                lyricMeta.artist = song.artist;
                lyricMeta.album = song.album;
                //lyricMeta.fileType = 'qrc';
                lyricMeta.lyricText = lyricText;
                man.addLyric(lyricMeta);
                ++lyricCount;

            } catch (e) {
                console.log("[qqmusic]request lyric exception: " + e.message);
            }
        });
    }

    return lyricCount;
}

function queryLyricV2(meta, man, songList)
{
    let headers = {};
    headers['Referer'] = 'https://y.qq.com';

    for (const song of songList) {
        let url = 'https://c.y.qq.com/qqmusic/fcgi-bin/lyric_download.fcg?';
        let data = {
            version: '15',
            miniversion: '82',
            lrctype: '4',
            musicid: song.id,
        };
        url += querystring.stringify(data);

        let settings = {
            method: 'get',
            url: url,
            headers: headers
        };

        request(settings, (err, res, body) => {
            if (err || res.statusCode != 200) {
                return;
            }

            body = body.replace('<!--', '').replace('-->', '').replace(/<miniversion.*\/>/, '').trim();
            let xmlRoot = mxml.loadString(body);
            if (xmlRoot != null) {
                let lyricMeta = man.createLyric();
                let lyrics = xmlRoot.findElement('lyric') || [];
                for (const lyricEntry of lyrics) {
                    let content = getChildElementCDATA(lyricEntry, 'content');
                    if (content == null) continue;
                    let lyricData = restoreQrc(content);
                    if (lyricData == null) continue;
                    lyricMeta.title = song.title;
                    lyricMeta.artist = song.artist;
                    lyricMeta.album = song.album;
                    lyricMeta.lyricData = lyricData;
                    //lyricMeta.fileType = 'qrc';
                    man.addLyric(lyricMeta);
                }
            }
        });
    }
}

function queryLyric(meta, man)
{
    let headers = {};
    headers['Referer'] = 'https://y.qq.com';

    // qury LRC lyrics
    let queryNum = 10;
    let url = 'http://c.y.qq.com/soso/fcgi-bin/client_search_cp?';
    let data = {
        format: 'json',
        n: queryNum,
        p: 0,
        w: meta.title + '+' + meta.artist,
        cr: 1,
        g_tk: 5381
    };
    url += querystring.stringify(data);

    var settings = {
        method: 'get',
        url: url,
        headers: headers
    };

    let stageSongList = [];
    request(settings, (err, res, body) => {
        console.log(err + url);
        if (!err && res.statusCode === 200) {
            try {
                var obj = JSON.parse(body);
                var data = obj['data'] || {};
                var song = data['song'] || {};
                var song_list = song['list'] || {};
                for (const song_entry of song_list) {
                    var title = song_entry['songname'] || '';
                    var album = song_entry['albumname'] || '';
                    var artist = '';
                    var artist_list = song_entry['singer'] || [];
                    if (artist_list.length > 0) {
                        artist = artist_list[0]['name'] || '';
                    }
                    var songmid = song_entry['songmid'] || '';
                    if (songmid === '') {
                        continue;
                    }
                    stageSongList.push({ title: title, album: album, artist: artist, songmid: songmid });
                }
            } catch (e) {
                console.log('qqmusic exception: ' + e.message);
            }
        }
    });

    var lyricMeta = man.createLyric();
    for (const result of stageSongList) {
        url = 'http://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?';
        data = {
            songmid: result.songmid,
            pcachetime: new Date().getTime(),
            g_tk: 5381,
            loginUin: 0,
            hostUin: 0,
            inCharset: 'utf8',
            outCharset: 'utf-8',
            notice: 0,
            platform: 'yqq',
            needNewCode: 1,
            format: 'json'
        };
        url += querystring.stringify(data);
        settings = {
            method: 'get',
            url: url,
            headers: headers
        };

        request(settings, (err, res, body) => {
            if (!err && res.statusCode === 200) {
                lyricMeta.title = result.title;
                lyricMeta.artist = result.artist;
                lyricMeta.album = result.album;
                try {
                    var obj = JSON.parse(body);
                    //console.log('!!! '+obj);
                    var b64lyric = obj['lyric'] || '';
                    var b64tlyric = obj['trans'] || '';
                    var lyric = atob(b64lyric);
                    var tlyric = atob(b64tlyric);
                    if (tlyric != '') lyric += tlyric;
                    lyricMeta.lyricText = lyric;
                    man.addLyric(lyricMeta);
                } catch (e) {
                    console.log('qqmusic parse lyric response exception: ' + e.message);
                }
            }
        });
    }
}

function getChildElementCDATA(node, name) {
    var child = node.findElement(name);
    if (child == null) {
        return '';
    }
    var schild = child.getFirstChild();
    if (schild == null) {
        return '';
    }
    return schild.getCDATA() || '';
}

function restoreQrc(hexText) {
    if (hexText.length % 2 != 0) return null;

    const sig = "[offset:0]\n";
    var arrBuf = new Uint8Array(hexText.length / 2 + sig.length);
    for (var i = 0; i < sig.length; ++i) {
        arrBuf[i] = sig.charCodeAt(i);
    }

    const offset = sig.length;
    for (var i = 0; i < hexText.length; i += 2) {
        arrBuf[offset + i / 2] = parseInt(hexText.slice(i, i + 2), 16);
    }

    //return arrBuf.buffer;
    return decodeQrc(arrBuf.buffer);
}

function remove_header_and_empty_line(ls) {
    return ls.filter((l)=>{
        if(!l)
            return false;
        if((/^\[[a-z]+:/.test(l)))
            return false;
        if(/^\[.+\] ?$/.test(l))
            return false;
        return true;
    });
}

function remove_qq_label(ls) {
    return ls.filter((l)=>{
        if(/^\[.+\](?: ?\/\/|QQ音乐享有本翻译作品的著作权)$/.test(l))
            return false;
        return true;
    });
}

function correct_timing(ls, ls_ref) {
    if(ls.length !== ls_ref.length) {
        console.log('!!! incorr length ' + ls.length + ' ' + ls_ref.length);
        //console.log('!!! '+ls.join('\n'));
        //console.log('!!! '+ls_ref.join('\n'));
        return ls;
    }
    
    return ls.map((l, idx) => {
        let m = /^\[([0-9:.]+)\](.*)$/.exec(l);
        let m_ref = /^\[([0-9:.]+)\](.*)$/.exec(ls_ref[idx]);
        if(m && m_ref) {
            return '[' + m_ref[1] + ']' + m[2];
        } else {
            return l;
        }
    });
}

function fix_translation(s, s_ref) {
    var ls = remove_header_and_empty_line(s.split(/[\r\n]/));
    var ls_ref = remove_header_and_empty_line(s_ref.split(/[\r\n]/));
    
    ls = correct_timing(ls, ls_ref);
    
    return remove_qq_label(ls).join('\n');
}
