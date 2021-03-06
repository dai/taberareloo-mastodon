// ==Taberareloo==
// {
//   "name"        : "Mastodon Model"
// , "description" : "Post to a Mastodon instance"
// , "include"     : ["background"]
// , "version"     : "0.6.1"
// , "downloadURL" : "https://raw.githubusercontent.com/ailispaw/taberareloo-mastodon/master/model.mastodon.tbrl.js"
// }
// ==/Taberareloo==

(function() {
  var BASE_URL = 'http://localhost:3000';

  var Mastodon = {
    name      : 'Mastodon',
    ICON      : BASE_URL + '/favicon.ico',
    LINK      : BASE_URL + '/',
    LOGIN_URL : BASE_URL + '/auth/sign_in',

    POST_URL  : BASE_URL + '/api/v1/statuses',
    MEDIA_URL : BASE_URL + '/api/v1/media',

    defaults : {
      sensitive    : false, // or true to hide an image
      spoiler_text : "",    // any text before "SHOW MORE"
      visibility   : ""     // "public", "unlisted", "private", "direct", or "" for your default
    },

    check : function (ps) {
      return /regular|photo|quote|link|video/.test(ps.type);
    },

    getAccessToken : function () {
      var self = this;

      return request(self.LINK).then(function (res) {
        var access_token = res.responseText.extract(/"access_token":"([^"]+?)"/);
        if (!access_token) {
          throw new Error(chrome.i18n.getMessage('error_notLoggedin', self.name));
        }
        var default_privacy = res.responseText.extract(/"default_privacy":"([^"]+?)"/);
        return {
          token   : access_token,
          privacy : default_privacy
        };
      });
    },

    createStatus : function (ps) {
      var self     = this;
      var template = TBRL.Config['entry']['twitter_template'];
      var spoiler  = '';
      var status   = '';

      if (ps.type === 'photo') {
        ps = update({}, ps);
        ps.itemUrl = ps.pageUrl;
      }
      if (!template) {
        switch (ps.type) {
          case 'regular':
            spoiler = ps.item;
            status  = ps.description;
            break;
          default:
            status = joinText([
              ps.description,
              (ps.body) ? '"' + ps.body + '"' : '',
              ps.item,
              ps.itemUrl
            ], '\n');
            break;
        }
      } else {
        status = templateExtract(template, {
          description   : ps.description,
          description_q : (ps.description) ? '"' + ps.description + '"' : null,
          body          : ps.body,
          body_q        : (ps.body) ? '"' + ps.body + '"' : null,
          title         : ps.item,
          title_q       : (ps.item) ? '"' + ps.item + '"' : null,
          link          : ps.itemUrl,
          link_q        : (ps.itemUrl) ? '"' + ps.itemUrl + '"' : null
        });
      }
      return {
        spoiler : spoiler,
        status  : status
      };
    },

    post : function (ps) {
      var self = this;

      var status = self.createStatus(ps);

      var content = update({}, self.defaults);
      update(content, {
        in_reply_to_id : null,
        media_ids      : [],
        status         : status.status
      });

      if (!content.spoiler_text) {
        content.spoiler_text = status.spoiler;
      }

      if (RegExp("(^|\\s)#?NSFW(\\s|$)", "g").test(content.spoiler_text + content.status)) {
        content.sensitive = true;
      }

      var promise = Promise.resolve(content);
      if (ps.type === 'photo') {
        promise = (
          ps.file ? Promise.resolve(ps.file) : download(ps.itemUrl).then(function (entry) {
            return getFileFromEntry(entry);
          })
        ).then(function (file) {
          return self.upload(file).then(function (json) {
            content.media_ids.push(json.id);
            return content;
          });
        });
      }

      return promise.then(function (content) {
        return self.getAccessToken().then(function (token) {
          if (!content.visibility) {
            content.visibility = token.privacy;
          }
          return request(self.POST_URL, {
            method       : 'POST',
            responseType : 'json',
            headers      : {
              'Content-Type'  : 'application/json',
              'Authorization' : 'Bearer ' + token.token
            },
            sendContent  : JSON.stringify(content)
          });
        });
      });
    },

    upload : function (file) {
      var self = this;

      // Convert WebP to PNG, because Mastodon doesn't support WebP image.
      var promise = Promise.resolve(file);
      if (file.type === 'image/webp') {
        promise = fileToPNGDataURL(file).then(function (pngDataURL) {
          return createFileEntryFromBlob(base64ToBlob(pngDataURL.binary, 'image/png'), 'png')
            .then(function (entry) {
              return getFileFromEntry(entry);
            });
        });
      }

      return promise.then(function (file) {
        return self.getAccessToken().then(function (token) {
          return request(self.MEDIA_URL, {
            method       : 'POST',
            responseType : 'json',
            headers      : {
              'Authorization' : 'Bearer ' + token.token
            },
            sendContent  : {
              file : file
            }
          }).then(function (res) {
            return res.response;
          }).catch(function (res) {
            var data = res.response;
            if (data && data.error) {
              throw new Error(data.error);
            } else {
              throw new Error('Could not upload the image');
            }
          });
        });
      });
    }
  };

  function download(url, ext) {
    return request(url, {
      responseType: 'blob'
    }).then(function (res) {
      var mime = res.getResponseHeader('Content-Type').replace(/;.*/, '');
      ext = getFileExtensionFromMime(mime) || ext;
      return createFileEntryFromBlob(res.response, ext);
    }).catch(function (res) {
      return res;
    });
  }

  function getFileExtensionFromMime(mime) {
    switch (mime) {
    case 'image/bmp':
      return 'bmp';
    case 'image/gif':
      return 'gif';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return undefined;
    }
  }

  function register (name, base_url, defaults) {
    var model = update({}, Mastodon);
    model.name      = 'Mastodon - ' + name;
    model.typeName  = 'Mastodon';
    model.ICON      = base_url + '/favicon.ico';
    model.LINK      = base_url + '/';
    model.LOGIN_URL = base_url + '/auth/sign_in';
    model.POST_URL  = base_url + '/api/v1/statuses';
    model.MEDIA_URL = base_url + '/api/v1/media';
    model.defaults  = update({}, model.defaults);
    if (defaults) {
      update(model.defaults, defaults);
    }
    Models.register(model);
  }

/*
  register('Local', 'http://localhost:3000', {
    sensitive    : false, // or true to hide an image
    spoiler_text : "",    // any text before "SHOW MORE"
    visibility   : ""     // "public", "unlisted", "private", "direct", or "" for your default
  });
*/
  register('social', 'https://mastodon.social');
  register('enl-jp', 'https://mastodon.ingress-enl.jp');
  register('MSTDN.JP', 'https://mstdn.jp');
  register('Pawoo', 'https://pawoo.net', {
    sensitive : true
  });
})();
