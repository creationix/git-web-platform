(function (realRequire) {
  var modules = {};
  var definitions = {};
  
  definitions["src/core.js"] = function (module, exports) {
    // This is the core recipe.  Feel free to change any piece with a new
    // implementation and re-generate the jsgit.js script using the `make.js`
    // tool in the root of this repo.
    
    // Some of these libraries assume setImmediate exists.  Let's polyfill it!
    if (!window.setImmediate) window.setImmediate = require('lib/defer.js');
    
    var platform = {
      sha1: require('node_modules/git-sha1/sha1.js'),
      bops: require('lib/bops/index.js'),
      tcp: require('node_modules/websocket-tcp-client/web-tcp.js').tcp,
      tls: require('node_modules/websocket-tcp-client/web-tcp.js').tls,
      // Uncomment these to enable zlib compression of the values
      // This is a time/space tradeoff.
      // inflate: require('git-zlib/inflate.js'),
      // deflate: require('git-zlib/deflate.js'),
    };
    platform.http = require('node_modules/git-http/pure-http.js')(platform);
    
    window.jsgit = {
      repo: require('node_modules/js-git/js-git.js')(platform),
      remote: require('node_modules/git-net/remote.js')(platform),
      db: require('node_modules/git-localdb/localdb.js')(platform),
      // Uncomment to switch to an in-memory database for quick testing.
      // db: require('git-memdb'),
      version: require('node_modules/js-git/package.json').version
    };
  };
  
  definitions["lib/defer.js"] = function (module, exports) {
    var timeouts = [];
    var messageName = "zero-timeout-message";
    
    function handleMessage(event) {
      if (event.source == window && event.data == messageName) {
        event.stopPropagation();
        if (timeouts.length > 0) {
          var fn = timeouts.shift();
          fn();
        }
      }
    }
    
    window.addEventListener("message", handleMessage, true);
    
    module.exports = function (fn) {
      timeouts.push(fn);
      window.postMessage(messageName, "*");
    };
  };
  
  definitions["node_modules/git-sha1/sha1.js"] = function (module, exports) {
    module.exports = sha1;
    
    function sha1(buffer) {
      if (buffer === undefined) return create();
      var shasum = create();
      shasum.update(buffer);
      return shasum.digest();
    }
    
    // A streaming interface for when nothing is passed in.
    function create() {
      var h0 = 0x67452301;
      var h1 = 0xEFCDAB89;
      var h2 = 0x98BADCFE;
      var h3 = 0x10325476;
      var h4 = 0xC3D2E1F0;
      // The first 64 bytes (16 words) is the data chunk
      var block = new Uint32Array(80), offset = 0, shift = 24;
      var totalLength = 0;
    
      return { update: update, digest: digest };
    
      // The user gave us more data.  Store it!
      function update(chunk) {
        if (typeof chunk === "string") return updateString(chunk);
        var length = chunk.length;
        totalLength += length * 8;
        for (var i = 0; i < length; i++) {
          write(chunk[i]);
        }
      }
    
      function updateString(string) {
        var encoded = unescape(encodeURIComponent(string));
        var length = encoded.length;
        totalLength += length * 8;
        for (var i = 0; i < length; i++) {
          write(encoded.charCodeAt(i));
        }
      }
    
      function write(byte) {
        block[offset] |= (byte & 0xff) << shift;
        if (shift) {
          shift -= 8;
        }
        else {
          offset++;
          shift = 24;
        }
        if (offset === 16) processBlock();
      }
    
      // No more data will come, pad the block, process and return the result.
      function digest() {
        // Pad
        write(0x80);
        if (offset > 14 || (offset === 14 && shift < 24)) {
          processBlock();
        }
        offset = 14;
        shift = 24;
    
        // 64-bit length big-endian
        write(0x00); // numbers this big aren't accurate in javascript anyway
        write(0x00); // ..So just hard-code to zero.
        write(totalLength > 0xffffffffff ? totalLength / 0x10000000000 : 0x00);
        write(totalLength > 0xffffffff ? totalLength / 0x100000000 : 0x00);
        for (var s = 24; s >= 0; s -= 8) {
          write(totalLength >> s);
        }
    
        // At this point one last processBlock() should trigger and we can pull out the result.
        return toHex(h0)
             + toHex(h1)
             + toHex(h2)
             + toHex(h3)
             + toHex(h4);
      }
    
      // We have a full block to process.  Let's do it!
      function processBlock() {
        // Extend the sixteen 32-bit words into eighty 32-bit words:
        for (var i = 16; i < 80; i++) {
          var w = block[i - 3] ^ block[i - 8] ^ block[i - 14] ^ block[i - 16];
          block[i] = (w << 1) | (w >>> 31);
        }
    
        // log(block);
    
        // Initialize hash value for this chunk:
        var a = h0;
        var b = h1;
        var c = h2;
        var d = h3;
        var e = h4;
        var f, k;
    
        // Main loop:
        for (i = 0; i < 80; i++) {
          if (i < 20) {
            f = d ^ (b & (c ^ d));
            k = 0x5A827999;
          }
          else if (i < 40) {
            f = b ^ c ^ d;
            k = 0x6ED9EBA1;
          }
          else if (i < 60) {
            f = (b & c) | (d & (b | c));
            k = 0x8F1BBCDC;
          }
          else {
            f = b ^ c ^ d;
            k = 0xCA62C1D6;
          }
          var temp = (a << 5 | a >>> 27) + f + e + k + block[i];
          e = d;
          d = c;
          c = (b << 30 | b >>> 2);
          b = a;
          a = temp;
        }
    
        // Add this chunk's hash to result so far:
        h0 = (h0 + a) | 0;
        h1 = (h1 + b) | 0;
        h2 = (h2 + c) | 0;
        h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0;
    
        // The block is now reusable.
        offset = 0;
        for (i = 0; i < 16; i++) {
          block[i] = 0;
        }
      }
    
      function toHex(word) {
        var hex = "";
        for (var i = 28; i >= 0; i -= 4) {
          hex += ((word >> i) & 0xf).toString(16);
        }
        return hex;
      }
    
    }
    
    /*
    // Uncomment to test in node.js
    
    var assert = require('assert');
    var tests = [
      "", "da39a3ee5e6b4b0d3255bfef95601890afd80709",
      "a", "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8",
      "abc", "a9993e364706816aba3e25717850c26c9cd0d89d",
      "message digest", "c12252ceda8be8994d5fa0290a47231c1d16aae3",
      "abcdefghijklmnopqrstuvwxyz", "32d10c7b8cf96570ca04ce37f2a19d84240d3a89",
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
        "84983e441c3bd26ebaae4aa1f95129e5e54670f1",
      "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabc",
        "a6319f25020d5ff8722d40ae750dbab67d94fe4f",
      "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZab",
        "edb3a03256d1c6d148034ec4795181931c933f46",
      "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZa",
        "677734f7bf40b2b244cae100bf365598fbf4741d",
    ]
    
    for (var i = 0; i < tests.length; i += 2) {
      var input = tests[i];
      console.log("\n" + JSON.stringify(input));
      var expectedHex = tests[i + 1];
      console.log(expectedHex);
      var hash = sha1(input);
      console.log(hash);
      if (hash !== expectedHex) {
        throw new Error(hash + " != " + expectedHex + " for '" + input + "'");
      }
      var sha1sum = sha1();
      for (var j = 0, l = input.length; j < l; j += 17) {
        sha1sum.update(input.substr(j, 17));
      }
      hash = sha1sum.digest();
      console.log(hash);
      if (hash !== expectedHex) {
        throw new Error(hash + " != " + expectedHex + " for '" + input + "'");
      }
    }
    
    console.log("\n1,000,000 repetitions of the character 'a'");
    var expectedHex = "34aa973cd4c4daa4f61eeb2bdbad27316534016f";
    console.log(expectedHex);
    var sha1sum = sha1();
    for (var i = 0; i < 100000; i++) {
      sha1sum.update("aaaaaaaaaa");
    }
    var hash = sha1sum.digest();
    console.log(hash);
    if (hash !== expectedHex) {
      throw new Error(hash + " != " + expectedHex + " for '" + input + "'");
    }
    */
  };
  
  definitions["lib/bops/index.js"] = function (module, exports) {
    // Repackaged from chrisdickinson/bops MIT licensed.
    
    var proto = {}
    module.exports = proto
    
    proto.from = require('lib/bops/from.js')
    proto.to = require('lib/bops/to.js')
    proto.is = require('lib/bops/is.js')
    proto.subarray = require('lib/bops/subarray.js')
    proto.join = require('lib/bops/join.js')
    proto.copy = require('lib/bops/copy.js')
    proto.create = require('lib/bops/create.js')
    
    mix(require('lib/bops/read.js'), proto)
    mix(require('lib/bops/write.js'), proto)
    
    function mix(from, into) {
      for(var key in from) {
        into[key] = from[key]
      }
    }
  };
  
  definitions["lib/bops/from.js"] = function (module, exports) {
    module.exports = from
    
    var base64 = require('node_modules/base64-js/lib/b64.js')
    
    var decoders = {
        hex: from_hex
      , utf8: from_utf
      , base64: from_base64
    }
    
    function from(source, encoding) {
      if(Array.isArray(source)) {
        return new Uint8Array(source)
      }
    
      return decoders[encoding || 'utf8'](source)
    }
    
    function from_hex(str) {
      var size = str.length / 2
        , buf = new Uint8Array(size)
        , character = ''
    
      for(var i = 0, len = str.length; i < len; ++i) {
        character += str.charAt(i)
    
        if(i > 0 && (i % 2) === 1) {
          buf[i>>>1] = parseInt(character, 16)
          character = '' 
        }
      }
    
      return buf 
    }
    
    function from_utf(str) {
      var bytes = []
        , tmp
        , ch
    
      for(var i = 0, len = str.length; i < len; ++i) {
        ch = str.charCodeAt(i)
        if(ch & 0x80) {
          tmp = encodeURIComponent(str.charAt(i)).substr(1).split('%')
          for(var j = 0, jlen = tmp.length; j < jlen; ++j) {
            bytes[bytes.length] = parseInt(tmp[j], 16)
          }
        } else {
          bytes[bytes.length] = ch 
        }
      }
    
      return new Uint8Array(bytes)
    }
    
    function from_base64(str) {
      return new Uint8Array(base64.toByteArray(str)) 
    }
  };
  
  definitions["node_modules/base64-js/lib/b64.js"] = function (module, exports) {
    (function (exports) {
    	'use strict';
    
    	var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    
    	function b64ToByteArray(b64) {
    		var i, j, l, tmp, placeHolders, arr;
    	
    		if (b64.length % 4 > 0) {
    			throw 'Invalid string. Length must be a multiple of 4';
    		}
    
    		// the number of equal signs (place holders)
    		// if there are two placeholders, than the two characters before it
    		// represent one byte
    		// if there is only one, then the three characters before it represent 2 bytes
    		// this is just a cheap hack to not do indexOf twice
    		placeHolders = b64.indexOf('=');
    		placeHolders = placeHolders > 0 ? b64.length - placeHolders : 0;
    
    		// base64 is 4/3 + up to two characters of the original data
    		arr = [];//new Uint8Array(b64.length * 3 / 4 - placeHolders);
    
    		// if there are placeholders, only get up to the last complete 4 chars
    		l = placeHolders > 0 ? b64.length - 4 : b64.length;
    
    		for (i = 0, j = 0; i < l; i += 4, j += 3) {
    			tmp = (lookup.indexOf(b64[i]) << 18) | (lookup.indexOf(b64[i + 1]) << 12) | (lookup.indexOf(b64[i + 2]) << 6) | lookup.indexOf(b64[i + 3]);
    			arr.push((tmp & 0xFF0000) >> 16);
    			arr.push((tmp & 0xFF00) >> 8);
    			arr.push(tmp & 0xFF);
    		}
    
    		if (placeHolders === 2) {
    			tmp = (lookup.indexOf(b64[i]) << 2) | (lookup.indexOf(b64[i + 1]) >> 4);
    			arr.push(tmp & 0xFF);
    		} else if (placeHolders === 1) {
    			tmp = (lookup.indexOf(b64[i]) << 10) | (lookup.indexOf(b64[i + 1]) << 4) | (lookup.indexOf(b64[i + 2]) >> 2);
    			arr.push((tmp >> 8) & 0xFF);
    			arr.push(tmp & 0xFF);
    		}
    
    		return arr;
    	}
    
    	function uint8ToBase64(uint8) {
    		var i,
    			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
    			output = "",
    			temp, length;
    
    		function tripletToBase64 (num) {
    			return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F];
    		};
    
    		// go through the array every three bytes, we'll deal with trailing stuff later
    		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
    			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
    			output += tripletToBase64(temp);
    		}
    
    		// pad the end with zeros, but make sure to not forget the extra bytes
    		switch (extraBytes) {
    			case 1:
    				temp = uint8[uint8.length - 1];
    				output += lookup[temp >> 2];
    				output += lookup[(temp << 4) & 0x3F];
    				output += '==';
    				break;
    			case 2:
    				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1]);
    				output += lookup[temp >> 10];
    				output += lookup[(temp >> 4) & 0x3F];
    				output += lookup[(temp << 2) & 0x3F];
    				output += '=';
    				break;
    		}
    
    		return output;
    	}
    
    	module.exports.toByteArray = b64ToByteArray;
    	module.exports.fromByteArray = uint8ToBase64;
    }());
  };
  
  definitions["lib/bops/to.js"] = function (module, exports) {
    module.exports = to
    
    var base64 = require('node_modules/base64-js/lib/b64.js')
      , toutf8 = require('node_modules/to-utf8/index.js')
    
    var encoders = {
        hex: to_hex
      , utf8: to_utf
      , base64: to_base64
    }
    
    function to(buf, encoding) {
      return encoders[encoding || 'utf8'](buf)
    }
    
    function to_hex(buf) {
      var str = ''
        , byt
    
      for(var i = 0, len = buf.length; i < len; ++i) {
        byt = buf[i]
        str += ((byt & 0xF0) >>> 4).toString(16)
        str += (byt & 0x0F).toString(16)
      }
    
      return str
    }
    
    function to_utf(buf) {
      return toutf8(buf)
    }
    
    function to_base64(buf) {
      return base64.fromByteArray(buf)
    }
  };
  
  definitions["node_modules/to-utf8/index.js"] = function (module, exports) {
    module.exports = to_utf8
    
    var out = []
      , col = []
      , fcc = String.fromCharCode
      , mask = [0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01]
      , unmask = [
          0x00
        , 0x01
        , 0x02 | 0x01
        , 0x04 | 0x02 | 0x01
        , 0x08 | 0x04 | 0x02 | 0x01
        , 0x10 | 0x08 | 0x04 | 0x02 | 0x01
        , 0x20 | 0x10 | 0x08 | 0x04 | 0x02 | 0x01
        , 0x40 | 0x20 | 0x10 | 0x08 | 0x04 | 0x02 | 0x01
      ]
    
    function to_utf8(bytes, start, end) {
      start = start === undefined ? 0 : start
      end = end === undefined ? bytes.length : end
    
      var idx = 0
        , hi = 0x80
        , collecting = 0
        , pos
        , by
    
      col.length =
      out.length = 0
    
      while(idx < bytes.length) {
        by = bytes[idx]
        if(!collecting && by & hi) {
          pos = find_pad_position(by)
          collecting += pos
          if(pos < 8) {
            col[col.length] = by & unmask[6 - pos]
          }
        } else if(collecting) {
          col[col.length] = by & unmask[6]
          --collecting
          if(!collecting && col.length) {
            out[out.length] = fcc(reduced(col, pos))
            col.length = 0
          }
        } else { 
          out[out.length] = fcc(by)
        }
        ++idx
      }
      if(col.length && !collecting) {
        out[out.length] = fcc(reduced(col, pos))
        col.length = 0
      }
      return out.join('')
    }
    
    function find_pad_position(byt) {
      for(var i = 0; i < 7; ++i) {
        if(!(byt & mask[i])) {
          break
        }
      }
      return i
    }
    
    function reduced(list) {
      var out = 0
      for(var i = 0, len = list.length; i < len; ++i) {
        out |= list[i] << ((len - i - 1) * 6)
      }
      return out
    }
  };
  
  definitions["lib/bops/is.js"] = function (module, exports) {
    module.exports = function(buffer) {
      return buffer instanceof Uint8Array;
    }
  };
  
  definitions["lib/bops/subarray.js"] = function (module, exports) {
    module.exports = subarray
    
    function subarray(buf, from, to) {
      return buf.subarray(from || 0, to || buf.length)
    }
  };
  
  definitions["lib/bops/join.js"] = function (module, exports) {
    module.exports = join
    
    function join(targets, hint) {
      if(!targets.length) {
        return new Uint8Array(0)
      }
    
      var len = hint !== undefined ? hint : get_length(targets)
        , out = new Uint8Array(len)
        , cur = targets[0]
        , curlen = cur.length
        , curidx = 0
        , curoff = 0
        , i = 0
    
      while(i < len) {
        if(curoff === curlen) {
          curoff = 0
          ++curidx
          cur = targets[curidx]
          curlen = cur && cur.length
          continue
        }
        out[i++] = cur[curoff++] 
      }
    
      return out
    }
    
    function get_length(targets) {
      var size = 0
      for(var i = 0, len = targets.length; i < len; ++i) {
        size += targets[i].byteLength
      }
      return size
    }
  };
  
  definitions["lib/bops/copy.js"] = function (module, exports) {
    module.exports = copy
    
    var slice = [].slice
    
    function copy(source, target, target_start, source_start, source_end) {
      target_start = arguments.length < 3 ? 0 : target_start
      source_start = arguments.length < 4 ? 0 : source_start
      source_end = arguments.length < 5 ? source.length : source_end
    
      if(source_end === source_start) {
        return
      }
    
      if(target.length === 0 || source.length === 0) {
        return
      }
    
      if(source_end > source.length) {
        source_end = source.length
      }
    
      if(target.length - target_start < source_end - source_start) {
        source_end = target.length - target_start + start
      }
    
      if(source.buffer !== target.buffer) {
        return fast_copy(source, target, target_start, source_start, source_end)
      }
      return slow_copy(source, target, target_start, source_start, source_end)
    }
    
    function fast_copy(source, target, target_start, source_start, source_end) {
      var len = (source_end - source_start) + target_start
    
      for(var i = target_start, j = source_start;
          i < len;
          ++i,
          ++j) {
        target[i] = source[j]
      }
    }
    
    function slow_copy(from, to, j, i, jend) {
      // the buffers could overlap.
      var iend = jend + i
        , tmp = new Uint8Array(slice.call(from, i, iend))
        , x = 0
    
      for(; i < iend; ++i, ++x) {
        to[j++] = tmp[x]
      }
    }
  };
  
  definitions["lib/bops/create.js"] = function (module, exports) {
    module.exports = function(size) {
      return new Uint8Array(size)
    }
  };
  
  definitions["lib/bops/read.js"] = function (module, exports) {
    module.exports = {
        readUInt8:      read_uint8
      , readInt8:       read_int8
      , readUInt16LE:   read_uint16_le
      , readUInt32LE:   read_uint32_le
      , readInt16LE:    read_int16_le
      , readInt32LE:    read_int32_le
      , readFloatLE:    read_float_le
      , readDoubleLE:   read_double_le
      , readUInt16BE:   read_uint16_be
      , readUInt32BE:   read_uint32_be
      , readInt16BE:    read_int16_be
      , readInt32BE:    read_int32_be
      , readFloatBE:    read_float_be
      , readDoubleBE:   read_double_be
    }
    
    var map = require('lib/bops/mapped.js')
    
    function read_uint8(target, at) {
      return target[at]
    }
    
    function read_int8(target, at) {
      var v = target[at];
      return v < 0x80 ? v : v - 0x100
    }
    
    function read_uint16_le(target, at) {
      var dv = map.get(target);
      return dv.getUint16(at + target.byteOffset, true)
    }
    
    function read_uint32_le(target, at) {
      var dv = map.get(target);
      return dv.getUint32(at + target.byteOffset, true)
    }
    
    function read_int16_le(target, at) {
      var dv = map.get(target);
      return dv.getInt16(at + target.byteOffset, true)
    }
    
    function read_int32_le(target, at) {
      var dv = map.get(target);
      return dv.getInt32(at + target.byteOffset, true)
    }
    
    function read_float_le(target, at) {
      var dv = map.get(target);
      return dv.getFloat32(at + target.byteOffset, true)
    }
    
    function read_double_le(target, at) {
      var dv = map.get(target);
      return dv.getFloat64(at + target.byteOffset, true)
    }
    
    function read_uint16_be(target, at) {
      var dv = map.get(target);
      return dv.getUint16(at + target.byteOffset, false)
    }
    
    function read_uint32_be(target, at) {
      var dv = map.get(target);
      return dv.getUint32(at + target.byteOffset, false)
    }
    
    function read_int16_be(target, at) {
      var dv = map.get(target);
      return dv.getInt16(at + target.byteOffset, false)
    }
    
    function read_int32_be(target, at) {
      var dv = map.get(target);
      return dv.getInt32(at + target.byteOffset, false)
    }
    
    function read_float_be(target, at) {
      var dv = map.get(target);
      return dv.getFloat32(at + target.byteOffset, false)
    }
    
    function read_double_be(target, at) {
      var dv = map.get(target);
      return dv.getFloat64(at + target.byteOffset, false)
    }
  };
  
  definitions["lib/bops/mapped.js"] = function (module, exports) {
    var proto
      , map
    
    module.exports = proto = {}
    
    map = typeof WeakMap === 'undefined' ? null : new WeakMap
    
    proto.get = !map ? no_weakmap_get : get
    
    function no_weakmap_get(target) {
      return new DataView(target.buffer, 0)
    }
    
    function get(target) {
      var out = map.get(target.buffer)
      if(!out) {
        map.set(target.buffer, out = new DataView(target.buffer, 0))
      }
      return out
    }
  };
  
  definitions["lib/bops/write.js"] = function (module, exports) {
    module.exports = {
        writeUInt8:      write_uint8
      , writeInt8:       write_int8
      , writeUInt16LE:   write_uint16_le
      , writeUInt32LE:   write_uint32_le
      , writeInt16LE:    write_int16_le
      , writeInt32LE:    write_int32_le
      , writeFloatLE:    write_float_le
      , writeDoubleLE:   write_double_le
      , writeUInt16BE:   write_uint16_be
      , writeUInt32BE:   write_uint32_be
      , writeInt16BE:    write_int16_be
      , writeInt32BE:    write_int32_be
      , writeFloatBE:    write_float_be
      , writeDoubleBE:   write_double_be
    }
    
    var map = require('lib/bops/mapped.js')
    
    function write_uint8(target, value, at) {
      return target[at] = value
    }
    
    function write_int8(target, value, at) {
      return target[at] = value < 0 ? value + 0x100 : value
    }
    
    function write_uint16_le(target, value, at) {
      var dv = map.get(target);
      return dv.setUint16(at + target.byteOffset, value, true)
    }
    
    function write_uint32_le(target, value, at) {
      var dv = map.get(target);
      return dv.setUint32(at + target.byteOffset, value, true)
    }
    
    function write_int16_le(target, value, at) {
      var dv = map.get(target);
      return dv.setInt16(at + target.byteOffset, value, true)
    }
    
    function write_int32_le(target, value, at) {
      var dv = map.get(target);
      return dv.setInt32(at + target.byteOffset, value, true)
    }
    
    function write_float_le(target, value, at) {
      var dv = map.get(target);
      return dv.setFloat32(at + target.byteOffset, value, true)
    }
    
    function write_double_le(target, value, at) {
      var dv = map.get(target);
      return dv.setFloat64(at + target.byteOffset, value, true)
    }
    
    function write_uint16_be(target, value, at) {
      var dv = map.get(target);
      return dv.setUint16(at + target.byteOffset, value, false)
    }
    
    function write_uint32_be(target, value, at) {
      var dv = map.get(target);
      return dv.setUint32(at + target.byteOffset, value, false)
    }
    
    function write_int16_be(target, value, at) {
      var dv = map.get(target);
      return dv.setInt16(at + target.byteOffset, value, false)
    }
    
    function write_int32_be(target, value, at) {
      var dv = map.get(target);
      return dv.setInt32(at + target.byteOffset, value, false)
    }
    
    function write_float_be(target, value, at) {
      var dv = map.get(target);
      return dv.setFloat32(at + target.byteOffset, value, false)
    }
    
    function write_double_be(target, value, at) {
      var dv = map.get(target);
      return dv.setFloat64(at + target.byteOffset, value, false)
    }
  };
  
  definitions["node_modules/websocket-tcp-client/web-tcp.js"] = function (module, exports) {
    exports.connect = connect;
    exports.tcp = { connect: connect.bind(null, "tcp") };
    exports.tls = { connect: connect.bind(null, "tls") };
    
    function connect(protocol, port, host, callback) {
      if (typeof host === "function" && typeof callback === "undefined") {
        callback = host;
        host = "127.0.0.1";
      }
      if (!callback) return connect.bind(this, port, host);
      if (typeof port !== "number") throw new TypeError("port must be number");
      if (typeof host !== "string") throw new TypeError("host must be string");
      if (typeof callback !== "function") throw new TypeError("callback must be function");
      var url = (document.location.protocol + "//" + document.location.host + "/").replace(/^http/, "ws") + protocol + "/" + host + "/" + port;
      var ws = new WebSocket(url, "tcp");
      ws.binaryType = 'arraybuffer';
      ws.onopen = function (evt) {
        ws.onmessage = function (evt) {
          if (evt.data === "connect") return callback(null, wrapSocket(ws));
          callback(new Error(evt.data));
        };
      };
    }
    
    function wrapSocket(ws) {
      var queue = [];
      var done, cb;
      var source, finish;
    
      ws.onmessage = function (evt) {
        var data = evt.data;
        if (typeof data === "string") {
          queue.push([new Error(data)]);
        }
        else {
          var str = "";
          data = new Uint8Array(data);
          for (var i = 0, l = data.length; i < l; i++) {
            str += String.fromCharCode(data[i]);
          }
          queue.push([null, data]);
        }
        return check();
      };
    
      ws.onclose = function (evt) {
        queue.push([]);
        return check();
      };
    
      ws.onerror = function (evt) {
        queue.push([new Error("Websocket connection closed")]);
        return check();
      };
    
      return { read: read, abort: abort, sink: sink };
    
      function read(callback) {
        if (done) return callback();
        if (cb) return callback(new Error("Only one read at a time allowed"));
        cb = callback;
        return check();
      }
    
      function check() {
        if (cb && queue.length) {
          var callback = cb;
          cb = null;
          callback.apply(null, queue.shift());
        }
      }
    
      function abort(callback) {
        if (done) return callback();
        done = true;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try { ws.close(); } catch (err) {}
        callback();
      }
    
      function sink(stream, callback) {
        if (!callback) return sink.bind(this, stream);
        if (source) throw new Error("Already has source");
        source = stream;
        finish = callback;
        source.read(onRead);
      }
    
      function onRead(err, chunk) {
        if (chunk === undefined) {
          try {
            ws.close();
          } catch (err) {}
          return finish(err);
        }
        ws.send(chunk);
        source.read(onRead);
      }
    
    }
  };
  
  definitions["node_modules/git-http/pure-http.js"] = function (module, exports) {
    var bops, tls, tcp, http, decoder, encoder, trace;
    var pushToPull = require('node_modules/git-http/node_modules/push-to-pull/transform.js');
    var writable = require('node_modules/git-net/writable.js');
    module.exports = function (platform) {
      bops = platform.bops;
      tcp = platform.tcp;
      tls = platform.tls;
      trace = platform.trace;
      http = require('node_modules/git-http/node_modules/http-codec/http-codec.js')(platform);
      decoder = pushToPull(http.client.decoder);
      encoder = http.client.encoder;
      return { request: request };
    };
    
    function request(opts, callback) {
      if (opts.tls && !tls) return callback(new Error("secure https not supported"));
      if (!opts.tls && !tcp) return callback(new Error("plain http not supported"));
    
      if (trace) trace("request", null, {
        method: opts.method,
        host: opts.hostname,
        port: opts.port,
        path: opts.path,
        headers: opts.headers
      });
    
      var read, abort, write;
    
      return (opts.tls ? tls : tcp).connect(opts.port, opts.hostname, onConnect);
    
      function onConnect(err, socket) {
        if (err) return callback(err);
        var input = decoder(socket);
        read = input.read;
        abort = input.abort;
        var output = writable(socket.abort);
        socket.sink(output, onEnd);
        write = encoder(output);
        write({
          method: opts.method,
          path: opts.path,
          headers: objToPairs(opts.headers)
        });
        read(onResponse);
        if (opts.body) {
          var body = opts.body;
          if (typeof body === "string") body = bops.from(body);
          if (bops.is(body)) {
            return write(body);
          }
          throw "TODO: streaming request body";
        }
      }
    
      function onResponse(err, res) {
        if (err) return callback(err);
        var headers = pairsToObj(res.headers);
    
        if (trace) trace("response", null, {
          code: res.code,
          headers: headers
        });
    
        callback(null, res.code, headers, {read:read,abort:abort});
    
      }
    
      function onEnd(err) {
        if (err) throw err;
      }
    
    }
    
    function objToPairs(obj) {
      return Object.keys(obj).map(function (key) {
        return [key, obj[key]];
      });
    }
    
    function pairsToObj(pairs) {
      var obj = {};
      pairs.forEach(function (pair) {
        obj[pair[0].toLowerCase()] = pair[1];
      });
      return obj;
    }
  };
  
  definitions["node_modules/git-http/node_modules/push-to-pull/transform.js"] = function (module, exports) {
    // input push-filter: (emit) -> emit
    // output is simple-stream pull-filter: (stream) -> stream
    module.exports = pushToPull;
    function pushToPull(parser) {
      return function (stream) {
      
        var write = parser(onData);
        var cb = null;
        var queue = [];
          
        return { read: read, abort: stream.abort };
        
        function read(callback) {
          if (queue.length) return callback(null, queue.shift());
          if (cb) return callback(new Error("Only one read at a time."));
          cb = callback;
          stream.read(onRead);
          
        }
    
        function onRead(err, item) {
          var callback = cb;
          cb = null;
          if (err) return callback(err);
          try {
            write(item);
          }
          catch (err) {
            return callback(err);
          }
          return read(callback);
        }
    
        function onData(item) {
          queue.push(item);
        }
    
      };
    }
  };
  
  definitions["node_modules/git-net/writable.js"] = function (module, exports) {
    module.exports = writable;
    
    function writable(abort) {
      var queue = [];
      var emit = null;
      
      write.read = read;
      write.abort = abort;
      write.error = error;
      return write;
      
      function write(item) {
        queue.push([null, item]);
        check();
      }
      
      function error(err) {
        queue.push([err]);
        check();
      }
      
      function read(callback) {
        if (queue.length) {
          return callback.apply(null, queue.shift());
        }
        if (emit) return callback(new Error("Only one read at a time"));
        emit = callback;
        check();
      }
      
      function check() {
        if (emit && queue.length) {
          var callback = emit;
          emit = null;
          callback.apply(null, queue.shift());
        }
      }
    }
  };
  
  definitions["node_modules/git-http/node_modules/http-codec/http-codec.js"] = function (module, exports) {
    var bops, HTTP1_1;
    module.exports = function (platform) {
      bops = platform.bops;
      HTTP1_1 = bops.from("HTTP/1.1");
      return {
        server: {
          encoder: serverEncoder,
          decoder: serverDecoder,
        },
        client: {
          encoder: clientEncoder,
          decoder: clientDecoder,
        },
      };
    };
    
    function serverEncoder(write) {
      return function (res) {
        throw "TODO: Implement serverEncoder";
      };
    }
    
    function clientEncoder(write) {
      return function (req) {
        if (req === undefined) return write(undefined);
        if (bops.is(req)) return write(req);
        var head = req.method + " " + req.path + " HTTP/1.1\r\n";
        req.headers.forEach(function (pair) {
          head += pair[0] + ": " + pair[1] + "\r\n";
        });
        head += "\r\n";
        write(bops.from(head));
      };
    }
    
    function clientDecoder(emit) {
      return parser(true, emit);
    }
    
    function serverDecoder(emit) {
      return parser(false, emit);
    }
    
    function parser(client, emit) {
      var position = 0, code = 0;
      var key = "", value = "";
      var chunked = false, length;
      var headers = [];
      var $start = client ? $client : $server;
      var state = $start;
      return function (chunk) {
        if (chunk === undefined) return emit();
        if (!state) return emit(chunk);
        var i = 0, length = chunk.length;
        while (i < length) {
          state = state(chunk[i++]);
          if (state) continue;
          emit(bops.subarray(chunk, i));
          break;
        }
      };
    
      function $client(byte) {
        if (byte === HTTP1_1[position++]) return $client;
        if (byte === 0x20 && position === 9) {
          position = 0;
          return $code;
        }
        throw new SyntaxError("Must be HTTP/1.1 response");
      }
    
      function $code(byte) {
        if (byte === 0x20) return $message;
        if (position++ < 3) {
          code = (code * 10) + byte - 0x30;
          position = 0;
          return $code;
        }
        throw new SyntaxError("Invalid status code");
      }
    
      function $message(byte) {
        if (byte === 0x0d) {
          position = 0;
          return $newline;
        }
        return $message;
      }
    
      function $server(byte) {
        throw "TODO: Implement server-side parser";
      }
    
      function $newline(byte) {
        if (byte === 0x0a) return $end;
        throw new SyntaxError("Invalid line ending");
      }
    
      function $end(byte) {
        if (byte === 0x0d) return $ending;
        return $key(byte);
      }
    
      function $key(byte) {
        if (byte === 0x3a) return $sep;
        key += String.fromCharCode(byte);
        return $key;
      }
    
      function $sep(byte) {
        if (byte === 0x20) return $sep;
        return $value(byte);
      }
    
      function $value(byte) {
        if (byte === 0x0d) {
          var lower = key.toLowerCase();
          if (lower === "transfer-encoding" && value === "chunked") {
            chunked = true;
          }
          else if (lower === "content-length") length = parseInt(value, 10);
          headers.push([key, value]);
          key = "";
          value = "";
          return $newline;
        }
        value += String.fromCharCode(byte);
        return $value;
      }
    
      function $ending(byte) {
        if (byte === 0x0a) {
          emit({
            code: code,
            headers: headers
          });
          headers = [];
          code = 0;
          if (chunked) return chunkMachine(emit, $start);
          return null;
        }
        throw new SyntaxError("Invalid header ending");
      }
    
    }
    
    function chunkMachine(emit, $start) {
      var position = 0, size = 0;
      var chunk = null;
      return $len;
      function $len(byte) {
        if (byte === 0x0d) return $chunkStart;
        size <<= 4;
        if (byte >= 0x30 && byte < 0x40) size += byte - 0x30;
        else if (byte > 0x60 && byte <= 0x66) size += byte - 0x57;
        else if (byte > 0x40 && byte <= 0x46) size += byte - 0x37;
        else throw new SyntaxError("Invalid chunked encoding length header");
        return $len;
      }
    
      function $chunkStart(byte) {
        if (byte === 0x0a) {
          if (size) {
            chunk = bops.create(size);
            return $chunk;
          }
          return $ending;
        }
        throw new SyntaxError("Invalid chunk ending");
      }
    
      function $chunk(byte) {
        chunk[position++] = byte;
        if (position < size) return $chunk;
        return $ending;
      }
    
      function $ending(byte) {
        if (byte !== 0x0d) throw new SyntaxError("Problem in chunked encoding");
        return $end;
    
      }
    
      function $end(byte) {
        if (byte !== 0x0a) throw new SyntaxError("Problem in chunked encoding");
        var next;
        if (size) {
          emit(chunk);
          next = $len;
        }
        else {
          emit();
          next = $start;
        }
        chunk = null;
        size = 0;
        position = 0;
        return next;
      }
    
    }
    
    
    // exports.encoder = encoder;
    // function encoder(emit) {
    //   var fn = function (err, item) {
    //     if (item === undefined) return emit(err);
    //     if (typeof item === "string") {
    //       return emit(null, bops.from(item));
    //     }
    //     if (bops.is(item)) {
    //       return emit(null, item);
    //     }
    //     var head = "HTTP/1.1 " + item.statusCode + " " + STATUS_CODES[item.statusCode] + "\r\n";
    //     for (var i = 0, l = item.headers.length; i < l; i += 2) {
    //       head += item.headers[i] + ": " + item.headers[i + 1] + "\r\n";
    //     }
    //     head += "\r\n";
    //     emit(null, bops.from(head));
    //   };
    //   fn.is = "min-stream-write";
    //   return fn;
    // }
    // encoder.is = "min-stream-push-filter";
    // function syntaxError(message, array) {
    //   return new SyntaxError(message + ": " +
    //     JSON.stringify(bops.to(bops.from(array)))
    //   );
    // }
    
    var STATUS_CODES = {
      '100': 'Continue',
      '101': 'Switching Protocols',
      '102': 'Processing',                 // RFC 2518, obsoleted by RFC 4918
      '200': 'OK',
      '201': 'Created',
      '202': 'Accepted',
      '203': 'Non-Authoritative Information',
      '204': 'No Content',
      '205': 'Reset Content',
      '206': 'Partial Content',
      '207': 'Multi-Status',               // RFC 4918
      '300': 'Multiple Choices',
      '301': 'Moved Permanently',
      '302': 'Moved Temporarily',
      '303': 'See Other',
      '304': 'Not Modified',
      '305': 'Use Proxy',
      '307': 'Temporary Redirect',
      '400': 'Bad Request',
      '401': 'Unauthorized',
      '402': 'Payment Required',
      '403': 'Forbidden',
      '404': 'Not Found',
      '405': 'Method Not Allowed',
      '406': 'Not Acceptable',
      '407': 'Proxy Authentication Required',
      '408': 'Request Time-out',
      '409': 'Conflict',
      '410': 'Gone',
      '411': 'Length Required',
      '412': 'Precondition Failed',
      '413': 'Request Entity Too Large',
      '414': 'Request-URI Too Large',
      '415': 'Unsupported Media Type',
      '416': 'Requested Range Not Satisfiable',
      '417': 'Expectation Failed',
      '418': 'I\'m a teapot',              // RFC 2324
      '422': 'Unprocessable Entity',       // RFC 4918
      '423': 'Locked',                     // RFC 4918
      '424': 'Failed Dependency',          // RFC 4918
      '425': 'Unordered Collection',       // RFC 4918
      '426': 'Upgrade Required',           // RFC 2817
      '500': 'Internal Server Error',
      '501': 'Not Implemented',
      '502': 'Bad Gateway',
      '503': 'Service Unavailable',
      '504': 'Gateway Time-out',
      '505': 'HTTP Version not supported',
      '506': 'Variant Also Negotiates',    // RFC 2295
      '507': 'Insufficient Storage',       // RFC 4918
      '509': 'Bandwidth Limit Exceeded',
      '510': 'Not Extended'                // RFC 2774
    };
  };
  
  definitions["node_modules/js-git/js-git.js"] = function (module, exports) {
    var platform;
    var applyDelta, pushToPull, parse, sha1, bops, trace;
    
    module.exports = function (imports) {
      if (platform) return newRepo;
    
      platform = imports;
      applyDelta = require('node_modules/js-git/node_modules/git-pack-codec/apply-delta.js')(platform);
      pushToPull = require('node_modules/js-git/node_modules/push-to-pull/transform.js');
      parse = pushToPull(require('node_modules/js-git/node_modules/git-pack-codec/decode.js')(platform));
      platform.agent = platform.agent || "js-git/" + require('node_modules/js-git/package.json').version;
      sha1 = platform.sha1;
      bops = platform.bops;
      trace = platform.trace;
    
      return newRepo;
    };
    
    function newRepo(db, workDir) {
      if (!db) throw new TypeError("A db interface instance is required");
    
      var encoders = {
        commit: encodeCommit,
        tag: encodeTag,
        tree: encodeTree,
        blob: encodeBlob
      };
    
      var decoders = {
        commit: decodeCommit,
        tag: decodeTag,
        tree: decodeTree,
        blob: decodeBlob
      };
    
      var repo = {};
    
      if (trace) {
        db = {
          get: wrap1("get", db.get),
          set: wrap2("set", db.set),
          has: wrap1("has", db.has),
          del: wrap1("del", db.del),
          keys: wrap1("keys", db.keys),
          init: wrap0("init", db.init),
        };
      }
    
      // Git Objects
      repo.load = load;       // (hashish) -> object
      repo.save = save;       // (object) -> hash
      repo.loadAs = loadAs;   // (type, hashish) -> value
      repo.saveAs = saveAs;   // (type, value) -> hash
      repo.remove = remove;   // (hashish)
      repo.unpack = unpack;   // (opts, packStream)
    
      // Convenience Readers
      repo.logWalk = logWalk;   // (hashish) => stream<commit>
      repo.treeWalk = treeWalk; // (hashish) => stream<object>
      repo.walk = walk;         // (seed, scan, compare) -> stream<object>
    
      // Refs
      repo.resolveHashish = resolveHashish; // (hashish) -> hash
      repo.updateHead = updateHead;         // (hash)
      repo.getHead = getHead;               // () -> ref
      repo.setHead = setHead;               // (ref)
      repo.readRef = readRef;               // (ref) -> hash
      repo.createRef = createRef;           // (ref, hash)
      repo.deleteRef = deleteRef;           // (ref)
      repo.listRefs = listRefs;             // (prefix) -> refs
    
      if (workDir) {
        // TODO: figure out API for working repos
      }
    
      // Network Protocols
      repo.fetch = fetch;
      repo.push = push;
    
      return repo;
    
      function wrap0(type, fn) {
        return zero;
        function zero(callback) {
          if (!callback) return zero.bind(this);
          return fn.call(this, check);
          function check(err) {
            if (err) return callback(err);
            trace(type, null);
            return callback.apply(this, arguments);
          }
        }
      }
    
      function wrap1(type, fn) {
        return one;
        function one(arg, callback) {
          if (!callback) return one.bind(this, arg);
          return fn.call(this, arg, check);
          function check(err) {
            if (err) return callback(err);
            trace(type, null, arg);
            return callback.apply(this, arguments);
          }
        }
      }
    
      function wrap2(type, fn) {
        return two;
        function two(arg1, arg2, callback) {
          if (!callback) return two.bind(this, arg1. arg2);
          return fn.call(this, arg1, arg2, check);
          function check(err) {
            if (err) return callback(err);
            trace(type, null, arg1);
            return callback.apply(this, arguments);
          }
        }
      }
    
      function logWalk(hashish, callback) {
        if (!callback) return logWalk.bind(this, hashish);
        var last, seen = {};
        return readRef("shallow", onShallow);
    
        function onShallow(err, shallow) {
          last = shallow;
          return loadAs("commit", hashish, onLoad);
        }
    
        function onLoad(err, commit, hash) {
          if (err) return callback(err);
          commit.hash = hash;
          seen[hash] = true;
          return callback(null, walk(commit, scan, loadKey, compare));
        }
    
        function scan(commit) {
          if (last === commit) return [];
          return commit.parents.filter(function (hash) {
            return !seen[hash];
          });
        }
    
        function loadKey(hash, callback) {
          return loadAs("commit", hash, function (err, commit) {
            if (err) return callback(err);
            commit.hash = hash;
            if (hash === last) commit.last = true;
            return callback(null, commit);
          });
        }
    
        function compare(commit, other) {
          return commit.author.date < other.author.date;
        }
      }
    
      function treeWalk(hashish, callback) {
        if (!callback) return treeWalk.bind(this, hashish);
        return load(hashish, onLoad);
        function onLoad(err, item, hash) {
          if (err) return callback(err);
          if (item.type === "commit") return load(item.body.tree, onLoad);
          item.hash = hash;
          item.path = "/";
          return callback(null, walk(item, treeScan, treeLoadKey, treeCompare));
        }
      }
    
      function treeScan(object) {
        if (object.type === "blob") return [];
        assertType(object, "tree");
        return object.body.filter(function (entry) {
          return entry.mode !== 0160000;
        }).map(function (entry) {
          var path = object.path + entry.name;
          if (entry.mode === 040000) path += "/";
          entry.path = path;
          return entry;
        });
      }
    
      function treeLoadKey(entry, callback) {
        return load(entry.hash, function (err, object) {
          if (err) return callback(err);
          entry.type = object.type;
          entry.body = object.body;
          return callback(null, entry);
        });
      }
    
      function treeCompare(first, second) {
        return first.path < second.path;
      }
    
      function walk(seed, scan, loadKey, compare) {
        var queue = [seed];
        var working = 0, error, cb;
        return {read: read, abort: abort};
    
        function read(callback) {
          if (cb) return callback(new Error("Only one read at a time"));
          if (working) { cb = callback; return; }
          var item = queue.shift();
          if (!item) return callback();
          try { scan(item).forEach(onKey); }
          catch (err) { return callback(err); }
          return callback(null, item);
        }
    
        function abort(callback) { return callback(); }
    
        function onError(err) {
          if (cb) {
            var callback = cb; cb = null;
            return callback(err);
          }
          error = err;
        }
    
        function onKey(key) {
          working++;
          loadKey(key, onItem);
        }
    
        function onItem(err, item) {
          working--;
          if (err) return onError(err);
          var index = queue.length;
          while (index && compare(item, queue[index - 1])) index--;
          queue.splice(index, 0, item);
          if (!working && cb) {
            var callback = cb; cb = null;
            return read(callback);
          }
        }
      }
    
      function load(hashish, callback) {
        if (!callback) return load.bind(this, hashish);
        var hash;
        return resolveHashish(hashish, onHash);
    
        function onHash(err, result) {
          if (err) return callback(err);
          hash = result;
          return db.get(hash, onBuffer);
        }
    
        function onBuffer(err, buffer) {
          if (err) return callback(err);
          var type, object;
          try {
            if (sha1(buffer) !== hash) {
              throw new Error("Hash checksum failed for " + hash);
            }
            var pair = deframe(buffer);
            type = pair[0];
            buffer = pair[1];
            object = {
              type: type,
              body: decoders[type](buffer)
            };
          } catch (err) {
            if (err) return callback(err);
          }
          return callback(null, object, hash);
        }
      }
    
      function save(object, callback) {
        if (!callback) return save.bind(this, object);
        var buffer, hash;
        try {
          buffer = encoders[object.type](object.body);
          buffer = frame(object.type, buffer);
          hash = sha1(buffer);
        }
        catch (err) {
          return callback(err);
        }
        return db.set(hash, buffer, onSave);
    
        function onSave(err) {
          if (err) return callback(err);
          return callback(null, hash);
        }
      }
    
      function loadAs(type, hashish, callback) {
        if (!callback) return loadAs.bind(this, type, hashish);
        return load(hashish, onObject);
    
        function onObject(err, object, hash) {
          if (err) return callback(err);
          if (object.type !== type) {
            return new Error("Expected " + type + ", but found " + object.type);
          }
          return callback(null, object.body, hash);
        }
      }
    
      function saveAs(type, body, callback) {
        if (!callback) return saveAs.bind(this, type, body);
        return save({ type: type, body: body }, callback);
      }
    
      function remove(hashish, callback) {
        if (!callback) return remove.bind(this, hashish);
        var hash;
        return resolveHashish(hashish, onHash);
    
        function onHash(err, result) {
          if (err) return callback(err);
          hash = result;
          return db.del(hash, callback);
        }
      }
    
      function resolveHashish(hashish, callback) {
        if (!callback) return resolveHashish.bind(this, hashish);
        hashish = hashish.trim();
        if ((/^[0-9a-f]{40}$/i).test(hashish)) {
          return callback(null, hashish.toLowerCase());
        }
        if (hashish === "HEAD") return getHead(onBranch);
        if ((/^refs\//).test(hashish)) {
          return db.get(hashish, checkBranch);
        }
        return checkBranch();
    
        function onBranch(err, ref) {
          if (err) return callback(err);
          if (!ref) return callback();
          return resolveHashish(ref, callback);
        }
    
        function checkBranch(err, hash) {
          if (err && err.code !== "ENOENT") return callback(err);
          if (hash) {
            return resolveHashish(hash, callback);
          }
          return db.get("refs/heads/" + hashish, checkTag);
        }
    
        function checkTag(err, hash) {
          if (err && err.code !== "ENOENT") return callback(err);
          if (hash) {
            return resolveHashish(hash, callback);
          }
          return db.get("refs/tags/" + hashish, final);
        }
    
        function final(err, hash) {
          if (err) return callback(err);
          if (hash) {
            return resolveHashish(hash, callback);
          }
          return callback(new Error("Cannot find hashish: " + hashish));
        }
      }
    
      function updateHead(hash, callback) {
        if (!callback) return updateHead.bind(this, hash);
        var ref;
        return getHead(onBranch);
    
        function onBranch(err, result) {
          if (err) return callback(err);
          ref = result;
          return db.set(ref, hash + "\n", callback);
        }
      }
    
      function getHead(callback) {
        if (!callback) return getHead.bind(this);
        return db.get("HEAD", onRead);
    
        function onRead(err, ref) {
          if (err) return callback(err);
          if (!ref) return callback();
          var match = ref.match(/^ref: *(.*)/);
          if (!match) return callback(new Error("Invalid HEAD"));
          return callback(null, match[1]);
        }
      }
    
      function setHead(branchName, callback) {
        if (!callback) return setHead.bind(this, branchName);
        var ref = "refs/heads/" + branchName;
        return db.set("HEAD", "ref: " + ref + "\n", callback);
      }
    
      function readRef(ref, callback) {
        if (!callback) return readRef.bind(this, ref);
        return db.get(ref, function (err, result) {
          if (err) return callback(err);
          if (!result) return callback();
          return callback(null, result.trim());
        });
      }
    
      function createRef(ref, hash, callback) {
        if (!callback) return createRef.bind(this, ref, hash);
        return db.set(ref, hash + "\n", callback);
      }
    
      function deleteRef(ref, callback) {
        if (!callback) return deleteRef.bind(this, ref);
        return db.del(ref, callback);
      }
    
      function listRefs(prefix, callback) {
        if (!callback) return listRefs.bind(this, prefix);
        var branches = {}, list = [], target = prefix;
        return db.keys(target, onNames);
    
        function onNames(err, names) {
          if (err) {
            if (err.code === "ENOENT") return shift();
            return callback(err);
          }
          for (var i = 0, l = names.length; i < l; ++i) {
            list.push(target + "/" + names[i]);
          }
          return shift();
        }
    
        function shift(err) {
          if (err) return callback(err);
          target = list.shift();
          if (!target) return callback(null, branches);
          return db.get(target, onRead);
        }
    
        function onRead(err, hash) {
          if (err) {
            if (err.code === "EISDIR") return db.keys(target, onNames);
            return callback(err);
          }
          if (hash) {
            branches[target] = hash.trim();
            return shift();
          }
          return db.keys(target, onNames);
        }
      }
    
      function indexOf(buffer, byte, i) {
        i |= 0;
        var length = buffer.length;
        for (;;i++) {
          if (i >= length) return -1;
          if (buffer[i] === byte) return i;
        }
      }
    
      function parseAscii(buffer, start, end) {
        var val = "";
        while (start < end) {
          val += String.fromCharCode(buffer[start++]);
        }
        return val;
      }
    
      function parseDec(buffer, start, end) {
        var val = 0;
        while (start < end) {
          val = val * 10 + buffer[start++] - 0x30;
        }
        return val;
      }
    
      function parseOct(buffer, start, end) {
        var val = 0;
        while (start < end) {
          val = (val << 3) + buffer[start++] - 0x30;
        }
        return val;
      }
    
      function deframe(buffer) {
        var space = indexOf(buffer, 0x20);
        if (space < 0) throw new Error("Invalid git object buffer");
        var nil = indexOf(buffer, 0x00, space);
        if (nil < 0) throw new Error("Invalid git object buffer");
        var body = bops.subarray(buffer, nil + 1);
        var size = parseDec(buffer, space + 1, nil);
        if (size !== body.length) throw new Error("Invalid body length.");
        return [
          parseAscii(buffer, 0, space),
          body
        ];
      }
    
      function frame(type, body) {
        return bops.join([
          bops.from(type + " " + body.length + "\0"),
          body
        ]);
      }
    
      // A sequence of bytes not containing the ASCII character byte
      // values NUL (0x00), LF (0x0a), '<' (0c3c), or '>' (0x3e).
      // The sequence may not begin or end with any bytes with the
      // following ASCII character byte values: SPACE (0x20),
      // '.' (0x2e), ',' (0x2c), ':' (0x3a), ';' (0x3b), '<' (0x3c),
      // '>' (0x3e), '"' (0x22), "'" (0x27).
      function safe(string) {
        return string.replace(/(?:^[\.,:;<>"']+|[\0\n<>]+|[\.,:;<>"']+$)/gm, "");
      }
    
      function formatDate(date) {
        var timezone = (date.timeZoneoffset || date.getTimezoneOffset()) / 60;
        var seconds = Math.floor(date.getTime() / 1000);
        return seconds + " " + (timezone > 0 ? "-0" : "0") + timezone + "00";
      }
    
      function encodePerson(person) {
        if (!person.name || !person.email) {
          throw new TypeError("Name and email are required for person fields");
        }
        return safe(person.name) +
          " <" + safe(person.email) + "> " +
          formatDate(person.date || new Date());
      }
    
      function encodeCommit(commit) {
        if (!commit.tree || !commit.author || !commit.message) {
          throw new TypeError("Tree, author, and message are require for commits");
        }
        var parents = commit.parents || (commit.parent ? [ commit.parent ] : []);
        if (!Array.isArray(parents)) {
          throw new TypeError("Parents must be an array");
        }
        var str = "tree " + commit.tree;
        for (var i = 0, l = parents.length; i < l; ++i) {
          str += "\nparent " + parents[i];
        }
        str += "\nauthor " + encodePerson(commit.author) +
               "\ncommitter " + encodePerson(commit.committer || commit.author) +
               "\n\n" + commit.message;
        return bops.from(str);
      }
    
      function encodeTag(tag) {
        if (!tag.object || !tag.type || !tag.tag || !tag.tagger || !tag.message) {
          throw new TypeError("Object, type, tag, tagger, and message required");
        }
        var str = "object " + tag.object +
          "\ntype " + tag.type +
          "\ntag " + tag.tag +
          "\ntagger " + encodePerson(tag.tagger) +
          "\n\n" + tag.message;
        return bops.from(str + "\n" + tag.message);
      }
    
      function pathCmp(a, b) {
        a += "/"; b += "/";
        return a < b ? -1 : a > b ? 1 : 0;
      }
    
      function encodeTree(tree) {
        var chunks = [];
        Object.keys(tree).sort(pathCmp).forEach(onName);
        return bops.join(chunks);
    
        function onName(name) {
          var entry = tree[name];
          chunks.push(
            bops.from(entry.mode.toString(8) + " " + name + "\0"),
            bops.from(entry.hash, "hex")
          );
        }
      }
    
      function encodeBlob(blob) {
        if (bops.is(blob)) return blob;
        return bops.from(blob);
      }
    
      function decodePerson(string) {
        var match = string.match(/^([^<]*) <([^>]*)> ([^ ]*) (.*)$/);
        if (!match) throw new Error("Improperly formatted person string");
        var sec = parseInt(match[3], 10);
        var date = new Date(sec * 1000);
        date.timeZoneoffset = parseInt(match[4], 10) / 100 * -60;
        return {
          name: match[1],
          email: match[2],
          date: date
        };
      }
    
    
      function decodeCommit(body) {
        var i = 0;
        var start;
        var key;
        var parents = [];
        var commit = {
          tree: "",
          parents: parents,
          author: "",
          committer: "",
          message: ""
        };
        while (body[i] !== 0x0a) {
          start = i;
          i = indexOf(body, 0x20, start);
          if (i < 0) throw new SyntaxError("Missing space");
          key = parseAscii(body, start, i++);
          start = i;
          i = indexOf(body, 0x0a, start);
          if (i < 0) throw new SyntaxError("Missing linefeed");
          var value = bops.to(bops.subarray(body, start, i++));
          if (key === "parent") {
            parents.push(value);
          }
          else {
            if (key === "author" || key === "committer") {
              value = decodePerson(value);
            }
            commit[key] = value;
          }
        }
        i++;
        commit.message = bops.to(bops.subarray(body, i));
        return commit;
      }
    
      function decodeTag(body) {
        var i = 0;
        var start;
        var key;
        var tag = {};
        while (body[i] !== 0x0a) {
          start = i;
          i = indexOf(body, 0x20, start);
          if (i < 0) throw new SyntaxError("Missing space");
          key = parseAscii(body, start, i++);
          start = i;
          i = indexOf(body, 0x0a, start);
          if (i < 0) throw new SyntaxError("Missing linefeed");
          var value = bops.to(bops.subarray(body, start, i++));
          if (key === "tagger") value = decodePerson(value);
          tag[key] = value;
        }
        i++;
        tag.message = bops.to(bops.subarray(body, i));
        return tag;
      }
    
      function decodeTree(body) {
        var i = 0;
        var length = body.length;
        var start;
        var mode;
        var name;
        var hash;
        var tree = [];
        while (i < length) {
          start = i;
          i = indexOf(body, 0x20, start);
          if (i < 0) throw new SyntaxError("Missing space");
          mode = parseOct(body, start, i++);
          start = i;
          i = indexOf(body, 0x00, start);
          name = bops.to(bops.subarray(body, start, i++));
          hash = bops.to(bops.subarray(body, i, i += 20), "hex");
          tree.push({
            mode: mode,
            name: name,
            hash: hash
          });
        }
        return tree;
      }
    
      function decodeBlob(body) {
        return body;
      }
    
      function fetch(remote, opts, callback) {
        if (!callback) return fetch.bind(this, remote, opts);
        var refs, branch, queue, ref, hash;
        return remote.discover(onDiscover);
    
        function onDiscover(err, serverRefs, serverCaps) {
          if (err) return callback(err);
          refs = serverRefs;
          opts.caps = processCaps(opts, serverCaps);
          return processWants(refs, opts.want, onWants);
        }
    
        function onWants(err, wants) {
          if (err) return callback(err);
          opts.wants = wants;
          return remote.fetch(repo, opts, onPackStream);
        }
    
        function onPackStream(err, raw) {
          if (err) return callback(err);
          if (!raw) return remote.close(callback);
          var packStream = parse(raw);
          return unpack(packStream, opts, onUnpack);
        }
    
        function onUnpack(err) {
          if (err) return callback(err);
          return remote.close(onClose);
        }
    
        function onClose(err) {
          if (err) return callback(err);
          queue = Object.keys(refs);
          return next();
        }
    
        function next(err) {
          if (err) return callback(err);
          ref = queue.shift();
          if (!ref) return setHead(branch, callback);
          if (ref === "HEAD" || /{}$/.test(ref)) return next();
          hash = refs[ref];
          if (!branch && (hash === refs.HEAD)) branch = ref.substr(11);
          db.has(hash, onHas);
        }
    
        function onHas(err, has) {
          if (err) return callback(err);
          if (!has) return next();
          return db.set(ref, hash + "\n", next);
        }
      }
    
      function processCaps(opts, serverCaps) {
        var caps = [];
        if (serverCaps["ofs-delta"]) caps.push("ofs-delta");
        if (serverCaps["thin-pack"]) caps.push("thin-pack");
        if (opts.includeTag && serverCaps["include-tag"]) caps.push("include-tag");
        if ((opts.onProgress || opts.onError) &&
            (serverCaps["side-band-64k"] || serverCaps["side-band"])) {
          caps.push(serverCaps["side-band-64k"] ? "side-band-64k" : "side-band");
          if (!opts.onProgress && serverCaps["no-progress"]) {
            caps.push("no-progress");
          }
        }
        if (serverCaps.agent) caps.push("agent=" + platform.agent);
        return caps;
      }
    
      function processWants(refs, filter, callback) {
        if (filter === null || filter === undefined) {
          return defaultWants(refs, callback);
        }
        filter = Array.isArray(filter) ? arrayFilter(filter) :
          typeof filter === "function" ? filter = filter :
          wantFilter(filter);
    
        var list = Object.keys(refs);
        var wants = {};
        var ref, hash;
        return shift();
        function shift() {
          ref = list.shift();
          if (!ref) return callback(null, Object.keys(wants));
          hash = refs[ref];
          resolveHashish(ref, onResolve);
        }
        function onResolve(err, oldHash) {
          // Skip refs we already have
          if (hash === oldHash) return shift();
          filter(ref, onFilter);
        }
        function onFilter(err, want) {
          if (err) return callback(err);
          // Skip refs the user doesn't want
          if (want) wants[hash] = true;
          return shift();
        }
      }
    
      function defaultWants(refs, callback) {
        return listRefs("refs/heads", onRefs);
    
        function onRefs(err, branches) {
          if (err) return callback(err);
          var wants = Object.keys(branches);
          wants.unshift("HEAD");
          return processWants(refs, wants, callback);
        }
      }
    
      function wantMatch(ref, want) {
        if (want === "HEAD" || want === null || want === undefined) {
          return ref === "HEAD";
        }
        if (Object.prototype.toString.call(want) === '[object RegExp]') {
          return want.test(ref);
        }
        if (typeof want === "boolean") return want;
        if (typeof want !== "string") {
          throw new TypeError("Invalid want type: " + typeof want);
        }
        return (/^refs\//.test(ref) && ref === want) ||
          (ref === "refs/heads/" + want) ||
          (ref === "refs/tags/" + want);
      }
    
      function wantFilter(want) {
        return filter;
        function filter(ref, callback) {
          var result;
          try {
            result = wantMatch(ref, want);
          }
          catch (err) {
            return callback(err);
          }
          return callback(null, result);
        }
      }
    
      function arrayFilter(want) {
        var length = want.length;
        return filter;
        function filter(ref, callback) {
          var result;
          try {
            for (var i = 0; i < length; ++i) {
              if (result = wantMatch(ref, want[i])) break;
            }
          }
          catch (err) {
            return callback(err);
          }
          return callback(null, result);
        }
      }
    
      function push() {
        throw new Error("TODO: Implement repo.fetch");
      }
    
      function unpack(packStream, opts, callback) {
        if (!callback) return unpack.bind(this, packStream, opts);
    
        var version, num, numDeltas = 0, count = 0, countDeltas = 0;
        var done, startDeltaProgress = false;
    
        // hashes keyed by offset for ofs-delta resolving
        var hashes = {};
        var has = {};
    
        return packStream.read(onStats);
    
        function onDone(err) {
          if (done) return;
          done = true;
          return callback(err);
        }
    
        function onStats(err, stats) {
          if (err) return onDone(err);
          version = stats.version;
          num = stats.num;
          packStream.read(onRead);
        }
    
        function objectProgress(more) {
          if (!more) startDeltaProgress = true;
          var percent = Math.round(count / num * 100);
          return opts.onProgress("Receiving objects: " + percent + "% (" + (count++) + "/" + num + ")   " + (more ? "\r" : "\n"));
        }
    
        function deltaProgress(more) {
          if (!startDeltaProgress) return;
          var percent = Math.round(countDeltas / numDeltas * 100);
          return opts.onProgress("Applying deltas: " + percent + "% (" + (countDeltas++) + "/" + numDeltas + ")   " + (more ? "\r" : "\n"));
        }
    
        function onRead(err, item) {
          if (err) return onDone(err);
          if (opts.onProgress) objectProgress(item);
          if (item === undefined) return resolveDeltas();
          if (item.size !== item.body.length) {
            return onDone(new Error("Body size mismatch"));
          }
          if (item.type === "ofs-delta") {
            numDeltas++;
            item.ref = hashes[item.offset - item.ref];
            return resolveDelta(item);
          }
          if (item.type === "ref-delta") {
            numDeltas++;
            return checkDelta(item);
          }
          return saveValue(item);
        }
    
        function resolveDelta(item) {
          if (opts.onProgress) deltaProgress();
          return db.get(item.ref, function (err, buffer) {
            if (err) return onDone(err);
            var target = deframe(buffer);
            item.type = target[0];
            item.body = applyDelta(item.body, target[1]);
            return saveValue(item);
          });
        }
    
        function checkDelta(item) {
          var hasTarget = has[item.ref];
          if (hasTarget === true) return resolveDelta(item);
          if (hasTarget === false) return enqueueDelta(item);
          return db.has(item.ref, function (err, value) {
            if (err) return onDone(err);
            has[item.ref] = value;
            if (value) return resolveDelta(item);
            return enqueueDelta(item);
          });
        }
    
        function saveValue(item) {
          var buffer = frame(item.type, item.body);
          var hash = hashes[item.offset] = sha1(buffer);
          has[hash] = true;
          return db.set(hash, buffer, onSave);
        }
    
        function onSave(err) {
          if (err) return callback(err);
          packStream.read(onRead);
        }
    
        function enqueueDelta(item) {
          // I have yet to come across a repo that actually needs this path.
          // It's hard to implement without something to test against.
          throw "TODO: enqueueDelta";
        }
    
        function resolveDeltas() {
          // TODO: resolve any pending deltas once enqueueDelta is implemented.
          return onDone();
        }
    
      }
    }
    
    function assertType(object, type) {
      if (object.type !== type) {
        throw new Error(type + " expected, but found " + object.type);
      }
    }
  };
  
  definitions["node_modules/js-git/node_modules/git-pack-codec/apply-delta.js"] = function (module, exports) {
    module.exports = function (platform) {
      var binary = platform.bops
        , Decoder = require('node_modules/js-git/node_modules/git-pack-codec/node_modules/varint/decode.js')
        , vi = new Decoder
    
      // we use writeUint[8|32][LE|BE] instead of indexing
      // into buffers so that we get buffer-browserify compat.
      var OFFSET_BUFFER = binary.create(4)
        , LENGTH_BUFFER = binary.create(4)
    
      return apply_delta;
      function apply_delta(delta, target) {
        var base_size_info = {size: null, buffer: null}
          , resized_size_info = {size: null, buffer: null}
          , output_buffer
          , out_idx
          , command
          , len
          , idx
    
        delta_header(delta, base_size_info)
        delta_header(base_size_info.buffer, resized_size_info)
    
        delta = resized_size_info.buffer
    
        idx =
        out_idx = 0
        output_buffer = binary.create(resized_size_info.size)
    
        len = delta.length
    
        while(idx < len) {
          command = delta[idx++]
          command & 0x80 ? copy() : insert()
        }
    
        return output_buffer
    
        function copy() {
          binary.writeUInt32LE(OFFSET_BUFFER, 0, 0)
          binary.writeUInt32LE(LENGTH_BUFFER, 0, 0)
    
          var check = 1
            , length
            , offset
    
          for(var x = 0; x < 4; ++x) {
            if(command & check) {
              OFFSET_BUFFER[3 - x] = delta[idx++]
            }
            check <<= 1
          }
    
          for(var x = 0; x < 3; ++x) {
            if(command & check) {
              LENGTH_BUFFER[3 - x] = delta[idx++]
            }
            check <<= 1
          }
          LENGTH_BUFFER[0] = 0
    
          length = binary.readUInt32BE(LENGTH_BUFFER, 0) || 0x10000
          offset = binary.readUInt32BE(OFFSET_BUFFER, 0)
    
          binary.copy(target, output_buffer, out_idx, offset, offset + length)
          out_idx += length
        }
    
        function insert() {
          binary.copy(delta, output_buffer, out_idx, idx, command + idx)
          idx += command
          out_idx += command
        }
      }
    
      function delta_header(buf, output) {
        var done = false
          , idx = 0
          , size = 0
    
        vi.ondata = function(s) {
          size = s
          done = true
        }
    
        do {
          vi.write(buf[idx++])
        } while(!done)
    
        output.size = size
        output.buffer = binary.subarray(buf, idx)
      }
    
    }
  };
  
  definitions["node_modules/js-git/node_modules/git-pack-codec/node_modules/varint/decode.js"] = function (module, exports) {
    module.exports = Decoder
    
    var MSB = 0x80
      , REST = 0x7F
    
    
    function Decoder() {
      this.accum = []
    }
    Decoder.prototype.write = write;
    
    function write(byte) {
      var msb = byte & MSB
        , accum = this.accum
        , len
        , out
    
      accum[accum.length] = byte & REST
      if(msb) {
        return
      }
    
      len = accum.length
      out = 0
    
      for(var i = 0; i < len; ++i) {
        out |= accum[i] << (7 * i)
      }
    
      accum.length = 0
      this.ondata(out)
      return
    }
  };
  
  definitions["node_modules/js-git/node_modules/push-to-pull/transform.js"] = function (module, exports) {
    // input push-filter: (emit) -> emit
    // output is simple-stream pull-filter: (stream) -> stream
    module.exports = pushToPull;
    function pushToPull(parser) {
      return function (stream) {
      
        var write = parser(onData);
        var cb = null;
        var queue = [];
          
        return { read: read, abort: stream.abort };
        
        function read(callback) {
          if (queue.length) return callback(null, queue.shift());
          if (cb) return callback(new Error("Only one read at a time."));
          cb = callback;
          stream.read(onRead);
          
        }
    
        function onRead(err, item) {
          var callback = cb;
          cb = null;
          if (err) return callback(err);
          try {
            write(item);
          }
          catch (err) {
            return callback(err);
          }
          return read(callback);
        }
    
        function onData(item) {
          queue.push(item);
        }
    
      };
    }
  };
  
  definitions["node_modules/js-git/node_modules/git-pack-codec/decode.js"] = function (module, exports) {
    var types = {
      "1": "commit",
      "2": "tree",
      "3": "blob",
      "4": "tag",
      "6": "ofs-delta",
      "7": "ref-delta"
    };
    
    module.exports = function (platform) {
      var inflate = require('node_modules/js-git/node_modules/git-pack-codec/inflate.js')(platform);
      var bops = platform.bops;
      var sha1 = platform.sha1;
    
      return function (emit) {
    
        var state = $pack;
        var sha1sum = sha1();
        var inf = inflate();
    
        var offset = 0;
        var position = 0;
        var version = 0x4b434150; // PACK reversed
        var num = 0;
        var type = 0;
        var length = 0;
        var ref = null;
        var checksum = "";
        var start = 0;
        var parts = [];
    
    
        return function (chunk) {
          if (chunk === undefined) {
            if (num || checksum.length < 40) throw new Error("Unexpected end of input stream");
            return emit();
          }
    
          for (var i = 0, l = chunk.length; i < l; i++) {
            // console.log([state, i, chunk[i].toString(16)]);
            if (!state) throw new Error("Unexpected extra bytes: " + bops.subarray(chunk, i));
            state = state(chunk[i], i, chunk);
            position++;
          }
          if (!state) return;
          if (state !== $checksum) sha1sum.update(chunk);
          var buff = inf.flush();
          if (buff.length) {
            parts.push(buff);
          }
        };
    
        // The first four bytes in a packfile are the bytes 'PACK'
        function $pack(byte) {
          if ((version & 0xff) === byte) {
            version >>>= 8;
            return version ? $pack : $version;
          }
          throw new Error("Invalid packfile header");
        }
    
        // The version is stored as an unsigned 32 integer in network byte order.
        // It must be version 2 or 3.
        function $version(byte) {
          version = (version << 8) | byte;
          if (++offset < 4) return $version;
          if (version >= 2 && version <= 3) {
            offset = 0;
            return $num;
          }
          throw new Error("Invalid version number " + num);
        }
    
        // The number of objects in this packfile is also stored as an unsigned 32 bit int.
        function $num(byte) {
          num = (num << 8) | byte;
          if (++offset < 4) return $num;
          offset = 0;
          emit({version: version, num: num});
          return $header;
        }
    
        // n-byte type and length (3-bit type, (n-1)*7+4-bit length)
        // CTTTSSSS
        // C is continue bit, TTT is type, S+ is length
        function $header(byte) {
          if (start === 0) start = position;
          type = byte >> 4 & 0x07;
          length = byte & 0x0f;
          if (byte & 0x80) {
            offset = 4;
            return $header2;
          }
          return afterHeader();
        }
    
        // Second state in the same header parsing.
        // CSSSSSSS*
        function $header2(byte) {
          length |= (byte & 0x7f) << offset;
          if (byte & 0x80) {
            offset += 7;
            return $header2;
          }
          return afterHeader();
        }
    
        // Common helper for finishing tiny and normal headers.
        function afterHeader() {
          offset = 0;
          if (type === 6) {
            ref = 0;
            return $ofsDelta;
          }
          if (type === 7) {
            ref = "";
            return $refDelta;
          }
          return $body;
        }
    
        // Big-endian modified base 128 number encoded ref offset
        function $ofsDelta(byte) {
          ref = byte & 0x7f;
          if (byte & 0x80) return $ofsDelta2;
          return $body;
        }
    
        function $ofsDelta2(byte) {
          ref = ((ref + 1) << 7) | (byte & 0x7f);
          if (byte & 0x80) return $ofsDelta2;
          return $body;
        }
    
        // 20 byte raw sha1 hash for ref
        function $refDelta(byte) {
          ref += toHex(byte);
          if (++offset < 20) return $refDelta;
          return $body;
        }
    
        // Common helper for generating 2-character hex numbers
        function toHex(num) {
          return num < 0x10 ? "0" + num.toString(16) : num.toString(16);
        }
    
        // Common helper for emitting all three object shapes
        function emitObject() {
          var item = {
            type: types[type],
            size: length,
            body: bops.join(parts),
            offset: start
          };
          if (ref) item.ref = ref;
          parts.length = 0;
          start = 0;
          offset = 0;
          type = 0;
          length = 0;
          ref = null;
          emit(item);
        }
    
        // Feed the deflated code to the inflate engine
        function $body(byte, i, chunk) {
          if (inf.write(byte)) return $body;
          var buf = inf.flush();
          inf.recycle();
          if (buf.length) {
            parts.push(buf);
          }
          emitObject();
          // If this was all the objects, start calculating the sha1sum
          if (--num) return $header;
          sha1sum.update(bops.subarray(chunk, 0, i + 1));
          return $checksum;
        }
    
        // 20 byte checksum
        function $checksum(byte) {
          checksum += toHex(byte);
          if (++offset < 20) return $checksum;
          var actual = sha1sum.digest();
          if (checksum !== actual) throw new Error("Checksum mismatch: " + actual + " != " + checksum);
        }
    
      };
    };
  };
  
  definitions["node_modules/js-git/node_modules/git-pack-codec/inflate.js"] = function (module, exports) {
    module.exports = function (platform) {
    
      var inflate = require('node_modules/js-git/node_modules/git-pack-codec/min.js')(platform);
      var bops = platform.bops;
    
      // Wrapper for proposed new API to inflate:
      //
      //   var inf = inflate();
      //   inf.write(byte) -> more - Write a byte to inflate's state-machine.
      //                             Returns true if more data is expected.
      //   inf.recycle()           - Reset the internal state machine.
      //   inf.flush() -> data     - Flush the output as a binary buffer.
      //
      // This is quite slow, but could be made fast if baked into inflate itself.
      return function () {
        var push = inflate(onEmit, onUnused);
        var more = true;
        var chunks = [];
        var b = bops.create(1);
    
        return { write: write, recycle: recycle, flush: flush };
    
        function write(byte) {
          b[0] = byte;
          push(null, b);
          return more;
        }
    
        function recycle() {
          push.recycle();
          more = true;
        }
    
        function flush() {
          var buffer = bops.join(chunks);
          chunks.length = 0;
          return buffer;
        }
    
        function onEmit(err, item) {
          if (err) throw err;
          if (item === undefined) {
            // console.log("onEnd");
            more = false;
            return;
          }
          chunks.push(item);
        }
    
        function onUnused(chunks) {
          // console.log("onUnused", chunks);
          more = false;
        }
      };
    
    };
  };
  
  definitions["node_modules/js-git/node_modules/git-pack-codec/min.js"] = function (module, exports) {
    module.exports = function (platform) {
      var binary = platform.bops;
    
      var MAXBITS = 15
        , MAXLCODES = 286
        , MAXDCODES = 30
        , MAXCODES = (MAXLCODES+MAXDCODES)
        , FIXLCODES = 288
    
      var lens = [
        3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
        35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258
      ]
    
      var lext = [
        0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
        3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
      ]
    
      var dists = [
        1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
        257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
        8193, 12289, 16385, 24577
      ]
    
      var dext = [
        0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
        7, 7, 8, 8, 9, 9, 10, 10, 11, 11,
        12, 12, 13, 13
      ]
    
      var order = [
        16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15
      ]
    
      var WINDOW = 32768
        , WINDOW_MINUS_ONE = WINDOW - 1
    
      function inflate(emit, on_unused) {
        var output = new Uint8Array(WINDOW)
          , need_input = false
          , buffer_offset = 0
          , bytes_read = 0
          , output_idx = 0
          , ended = false
          , state = null
          , states = []
          , buffer = []
          , got = 0
    
        // buffer up to 128k "output one" bytes
        var OUTPUT_ONE_LENGTH = 131070
          , output_one_offs = OUTPUT_ONE_LENGTH
          , output_one_buf
    
        var bitbuf = 0
          , bitcnt = 0
          , is_final = false
          , fixed_codes
    
        var adler_s1 = 1
          , adler_s2 = 0
    
        onread.recycle = function recycle() {
          var out
          buffer.length = 0
          buffer_offset = 0
          output_idx = 0
          bitbuf = 0
          bitcnt = 0
          states.length = 0
          is_final = false
          need_input = false
          bytes_read = 0
          output_idx = 0
          ended = false
          got = 0
          adler_s1 = 1
          adler_s2 = 0
          output_one_offs = 0
          become(noop, {}, noop)
          start_stream_header()
          // return stream
        }
    
        var bytes_need = 0
          , bytes_value = []
    
        var bits_need = 0
          , bits_value = []
    
        var codes_distcode = null
          , codes_lencode = null
          , codes_len = 0
          , codes_dist = 0
          , codes_symbol = 0
    
        var dynamic_distcode = {symbol: [], count: []}
          , dynamic_lencode = {symbol: [], count: []}
          , dynamic_lengths = []
          , dynamic_nlen = 0
          , dynamic_ndist = 0
          , dynamic_ncode = 0
          , dynamic_index = 0
          , dynamic_symbol = 0
          , dynamic_len = 0
    
        var decode_huffman = null
          , decode_len = 0
          , decode_code = 0
          , decode_first = 0
          , decode_count = 0
          , decode_index = 0
    
        var last = null
    
        become(noop, {}, noop)
        start_stream_header()
    
        return onread
    
        function onread(err, buf) {
          if(buf === undefined) {
            return emit(err)
          }
    
          return write(buf)
        }
    
        function noop() {
    
        }
    
        function call_header() {
        }
    
        function call_bytes(need) {
          bytes_value.length = 0
          bytes_need = need
        }
    
        function call_bits(need) {
          bits_value = 0
          bits_need = need
        }
    
        function call_codes(distcode, lencode) {
          codes_len =
          codes_dist =
          codes_symbol = 0
          codes_distcode = distcode
          codes_lencode = lencode
        }
    
        function call_dynamic() {
          dynamic_distcode.symbol.length =
          dynamic_distcode.count.length =
          dynamic_lencode.symbol.length =
          dynamic_lencode.count.length =
          dynamic_lengths.length = 0
          dynamic_nlen = 0
          dynamic_ndist = 0
          dynamic_ncode = 0
          dynamic_index = 0
          dynamic_symbol = 0
          dynamic_len = 0
        }
    
        function call_decode(h) {
          decode_huffman = h
          decode_len = 1
          decode_first =
          decode_index =
          decode_code = 0
        }
    
        function write(buf) {
          buffer.push(buf)
          got += buf.length
          if(!ended) {
            execute()
          }
        }
    
        function execute() {
          do {
            states[0].current()
          } while(!need_input && !ended)
    
          var needed = need_input
          need_input = false
        }
    
        function start_stream_header() {
          become(bytes, call_bytes(2), got_stream_header)
        }
    
        function got_stream_header() {
          var cmf = last[0]
            , flg = last[1]
    
    
          if((cmf << 8 | flg) % 31 !== 0) {
            emit(new Error(
              'failed header check'
            ))
            return
          }
    
    
    
    
          if(flg & 32) {
            return become(bytes, call_bytes(4), on_got_fdict)
          }
          return become(bits, call_bits(1), on_got_is_final)
        }
    
    
    
    
        function on_got_fdict() {
          return become(bits, call_bits(1), on_got_is_final)
        }
    
    
    
    
    
    
    
    
        function on_got_is_final() {
          is_final = last
          become(bits, call_bits(2), on_got_type)
        }
    
    
    
    
    
    
    
    
    
    
    
    
        function on_got_type() {
          if(last === 0) {
            become(bytes, call_bytes(4), on_got_len_nlen)
            return
          }
    
          if(last === 1) {
            // `fixed` and `dynamic` blocks both eventually delegate
            // to the "codes" state -- which reads bits of input, throws
            // them into a huffman tree, and produces "symbols" of output.
            fixed_codes = fixed_codes || build_fixed()
            become(start_codes, call_codes(
              fixed_codes.distcode
            , fixed_codes.lencode
            ), done_with_codes)
            return
          }
    
          become(start_dynamic, call_dynamic(), done_with_codes)
          return
        }
    
    
    
    
        function on_got_len_nlen() {
          var want = last[0] | (last[1] << 8)
            , nlen = last[2] | (last[3] << 8)
    
          if((~nlen & 0xFFFF) !== want) {
            emit(new Error(
              'failed len / nlen check'
            ))
          }
    
          if(!want) {
            become(bits, call_bits(1), on_got_is_final)
            return
          }
          become(bytes, call_bytes(want), on_got_stored)
        }
    
    
    
    
        function on_got_stored() {
          output_many(last)
          if(is_final) {
            become(bytes, call_bytes(4), on_got_adler)
            return
          }
          become(bits, call_bits(1), on_got_is_final)
        }
    
    
    
    
    
    
        function start_dynamic() {
          become(bits, call_bits(5), on_got_nlen)
        }
    
        function on_got_nlen() {
          dynamic_nlen = last + 257
          become(bits, call_bits(5), on_got_ndist)
        }
    
        function on_got_ndist() {
          dynamic_ndist = last + 1
          become(bits, call_bits(4), on_got_ncode)
        }
    
        function on_got_ncode() {
          dynamic_ncode = last + 4
          if(dynamic_nlen > MAXLCODES || dynamic_ndist > MAXDCODES) {
            emit(new Error('bad counts'))
            return
          }
    
          become(bits, call_bits(3), on_got_lengths_part)
        }
    
        function on_got_lengths_part() {
          dynamic_lengths[order[dynamic_index]] = last
    
          ++dynamic_index
          if(dynamic_index === dynamic_ncode) {
            for(; dynamic_index < 19; ++dynamic_index) {
              dynamic_lengths[order[dynamic_index]] = 0
            }
    
            // temporarily construct the `lencode` using the
            // lengths we've read. we'll actually be using the
            // symbols produced by throwing bits into the huffman
            // tree to constuct the `lencode` and `distcode` huffman
            // trees.
            construct(dynamic_lencode, dynamic_lengths, 19)
            dynamic_index = 0
    
            become(decode, call_decode(dynamic_lencode), on_got_dynamic_symbol_iter)
            return
          }
          become(bits, call_bits(3), on_got_lengths_part)
        }
    
        function on_got_dynamic_symbol_iter() {
          dynamic_symbol = last
    
          if(dynamic_symbol < 16) {
            dynamic_lengths[dynamic_index++] = dynamic_symbol
            do_check()
            return
          }
    
          dynamic_len = 0
          if(dynamic_symbol === 16) {
            become(bits, call_bits(2), on_got_dynamic_symbol_16)
            return
          }
    
          if(dynamic_symbol === 17) {
            become(bits, call_bits(3), on_got_dynamic_symbol_17)
            return
          }
    
          become(bits, call_bits(7), on_got_dynamic_symbol)
        }
    
        function on_got_dynamic_symbol_16() {
          dynamic_len = dynamic_lengths[dynamic_index - 1]
          on_got_dynamic_symbol_17()
        }
    
        function on_got_dynamic_symbol_17() {
          dynamic_symbol = 3 + last
          do_dynamic_end_loop()
        }
    
        function on_got_dynamic_symbol() {
          dynamic_symbol = 11 + last
          do_dynamic_end_loop()
        }
    
        function do_dynamic_end_loop() {
          if(dynamic_index + dynamic_symbol > dynamic_nlen + dynamic_ndist) {
            emit(new Error('too many lengths'))
            return
          }
    
          while(dynamic_symbol--) {
            dynamic_lengths[dynamic_index++] = dynamic_len
          }
    
          do_check()
        }
    
        function do_check() {
          if(dynamic_index >= dynamic_nlen + dynamic_ndist) {
            end_read_dynamic()
            return
          }
          become(decode, call_decode(dynamic_lencode), on_got_dynamic_symbol_iter)
        }
    
        function end_read_dynamic() {
          // okay, we can finally start reading data out of the stream.
          construct(dynamic_lencode, dynamic_lengths, dynamic_nlen)
          construct(dynamic_distcode, dynamic_lengths.slice(dynamic_nlen), dynamic_ndist)
          become(start_codes, call_codes(
              dynamic_distcode
            , dynamic_lencode
          ), done_with_codes)
        }
    
        function start_codes() {
          become(decode, call_decode(codes_lencode), on_got_codes_symbol)
        }
    
        function on_got_codes_symbol() {
          var symbol = codes_symbol = last
          if(symbol < 0) {
            emit(new Error('invalid symbol'))
            return
          }
    
          if(symbol < 256) {
            output_one(symbol)
            become(decode, call_decode(codes_lencode), on_got_codes_symbol)
            return
          }
    
          if(symbol > 256) {
            symbol = codes_symbol -= 257
            if(symbol >= 29) {
              emit(new Error('invalid fixed code'))
              return
            }
    
            become(bits, call_bits(lext[symbol]), on_got_codes_len)
            return
          }
    
          if(symbol === 256) {
            unbecome()
            return
          }
        }
    
    
    
    
    
    
        function on_got_codes_len() {
          codes_len = lens[codes_symbol] + last
          become(decode, call_decode(codes_distcode), on_got_codes_dist_symbol)
        }
    
    
        function on_got_codes_dist_symbol() {
          codes_symbol = last
          if(codes_symbol < 0) {
            emit(new Error('invalid distance symbol'))
            return
          }
    
          become(bits, call_bits(dext[codes_symbol]), on_got_codes_dist_dist)
        }
    
        function on_got_codes_dist_dist() {
          var dist = dists[codes_symbol] + last
    
          // Once we have a "distance" and a "length", we start to output bytes.
          // We reach "dist" back from our current output position to get the byte
          // we should repeat and output it (thus moving the output window cursor forward).
          // Two notes:
          //
          // 1. Theoretically we could overlap our output and input.
          // 2. `X % (2^N) == X & (2^N - 1)` with the distinction that
          //    the result of the bitwise AND won't be negative for the
          //    range of values we're feeding it. Spare a modulo, spoil the child.
          while(codes_len--) {
            output_one(output[(output_idx - dist) & WINDOW_MINUS_ONE])
          }
    
          become(decode, call_decode(codes_lencode), on_got_codes_symbol)
        }
    
        function done_with_codes() {
          if(is_final) {
            become(bytes, call_bytes(4), on_got_adler)
            return
          }
          become(bits, call_bits(1), on_got_is_final)
        }
    
    
    
    
        function on_got_adler() {
          var check_s1 = last[3] | (last[2] << 8)
            , check_s2 = last[1] | (last[0] << 8)
    
          if(check_s2 !== adler_s2 || check_s1 !== adler_s1) {
            emit(new Error(
              'bad adler checksum: '+[check_s2, adler_s2, check_s1, adler_s1]
            ))
            return
          }
    
          ended = true
    
          output_one_recycle()
    
          if(on_unused) {
            on_unused(
                [binary.subarray(buffer[0], buffer_offset)].concat(buffer.slice(1))
              , bytes_read
            )
          }
    
          output_idx = 0
          ended = true
          emit()
        }
    
        function decode() {
          _decode()
        }
    
        function _decode() {
          if(decode_len > MAXBITS) {
            emit(new Error('ran out of codes'))
            return
          }
    
          become(bits, call_bits(1), got_decode_bit)
        }
    
        function got_decode_bit() {
          decode_code = (decode_code | last) >>> 0
          decode_count = decode_huffman.count[decode_len]
          if(decode_code < decode_first + decode_count) {
            unbecome(decode_huffman.symbol[decode_index + (decode_code - decode_first)])
            return
          }
          decode_index += decode_count
          decode_first += decode_count
          decode_first <<= 1
          decode_code = (decode_code << 1) >>> 0
          ++decode_len
          _decode()
        }
    
    
        function become(fn, s, then) {
          if(typeof then !== 'function') {
            throw new Error
          }
          states.unshift({
            current: fn
          , next: then
          })
        }
    
        function unbecome(result) {
          if(states.length > 1) {
            states[1].current = states[0].next
          }
          states.shift()
          if(!states.length) {
            ended = true
    
            output_one_recycle()
            if(on_unused) {
              on_unused(
                  [binary.subarray(buffer[0], buffer_offset)].concat(buffer.slice(1))
                , bytes_read
              )
            }
            output_idx = 0
            ended = true
            emit()
            // return
          }
          else {
            last = result
          }
        }
    
        function bits() {
          var byt
            , idx
    
          idx = 0
          bits_value = bitbuf
          while(bitcnt < bits_need) {
            // we do this to preserve `bits_value` when
            // "need_input" is tripped.
            //
            // fun fact: if we moved that into the `if` statement
            // below, it would trigger a deoptimization of this (very
            // hot) function. JITs!
            bitbuf = bits_value
            byt = take()
            if(need_input) {
              break
            }
            ++idx
            bits_value = (bits_value | (byt << bitcnt)) >>> 0
            bitcnt += 8
          }
    
          if(!need_input) {
            bitbuf = bits_value >>> bits_need
            bitcnt -= bits_need
            unbecome((bits_value & ((1 << bits_need) - 1)) >>> 0)
          }
        }
    
    
    
        function bytes() {
          var byte_accum = bytes_value
            , value
    
          while(bytes_need--) {
            value = take()
    
    
            if(need_input) {
              bitbuf = bitcnt = 0
              bytes_need += 1
              break
            }
            byte_accum[byte_accum.length] = value
          }
          if(!need_input) {
            bitcnt = bitbuf = 0
            unbecome(byte_accum)
          }
        }
    
    
    
        function take() {
          if(!buffer.length) {
            need_input = true
            return
          }
    
          if(buffer_offset === buffer[0].length) {
            buffer.shift()
            buffer_offset = 0
            return take()
          }
    
          ++bytes_read
    
          return bitbuf = takebyte()
        }
    
        function takebyte() {
          return buffer[0][buffer_offset++]
        }
    
    
    
        function output_one(val) {
          adler_s1 = (adler_s1 + val) % 65521
          adler_s2 = (adler_s2 + adler_s1) % 65521
          output[output_idx++] = val
          output_idx &= WINDOW_MINUS_ONE
          output_one_pool(val)
        }
    
        function output_one_pool(val) {
          if(output_one_offs === OUTPUT_ONE_LENGTH) {
            output_one_recycle()
          }
    
          output_one_buf[output_one_offs++] = val
        }
    
        function output_one_recycle() {
          if(output_one_offs > 0) {
            if(output_one_buf) {
              emit(null, binary.subarray(output_one_buf, 0, output_one_offs))
            } else {
            }
            output_one_buf = binary.create(OUTPUT_ONE_LENGTH)
            output_one_offs = 0
          }
        }
    
        function output_many(vals) {
          var len
            , byt
            , olen
    
          output_one_recycle()
          for(var i = 0, len = vals.length; i < len; ++i) {
            byt = vals[i]
            adler_s1 = (adler_s1 + byt) % 65521
            adler_s2 = (adler_s2 + adler_s1) % 65521
            output[output_idx++] = byt
            output_idx &= WINDOW_MINUS_ONE
          }
    
          emit(null, binary.from(vals))
        }
      }
    
      function build_fixed() {
        var lencnt = []
          , lensym = []
          , distcnt = []
          , distsym = []
    
        var lencode = {
            count: lencnt
          , symbol: lensym
        }
    
        var distcode = {
            count: distcnt
          , symbol: distsym
        }
    
        var lengths = []
          , symbol
    
        for(symbol = 0; symbol < 144; ++symbol) {
          lengths[symbol] = 8
        }
        for(; symbol < 256; ++symbol) {
          lengths[symbol] = 9
        }
        for(; symbol < 280; ++symbol) {
          lengths[symbol] = 7
        }
        for(; symbol < FIXLCODES; ++symbol) {
          lengths[symbol] = 8
        }
        construct(lencode, lengths, FIXLCODES)
    
        for(symbol = 0; symbol < MAXDCODES; ++symbol) {
          lengths[symbol] = 5
        }
        construct(distcode, lengths, MAXDCODES)
        return {lencode: lencode, distcode: distcode}
      }
    
      function construct(huffman, lengths, num) {
        var symbol
          , left
          , offs
          , len
    
        offs = []
    
        for(len = 0; len <= MAXBITS; ++len) {
          huffman.count[len] = 0
        }
    
        for(symbol = 0; symbol < num; ++symbol) {
          huffman.count[lengths[symbol]] += 1
        }
    
        if(huffman.count[0] === num) {
          return
        }
    
        left = 1
        for(len = 1; len <= MAXBITS; ++len) {
          left <<= 1
          left -= huffman.count[len]
          if(left < 0) {
            return left
          }
        }
    
        offs[1] = 0
        for(len = 1; len < MAXBITS; ++len) {
          offs[len + 1] = offs[len] + huffman.count[len]
        }
    
        for(symbol = 0; symbol < num; ++symbol) {
          if(lengths[symbol] !== 0) {
            huffman.symbol[offs[lengths[symbol]]++] = symbol
          }
        }
    
        return left
      }
    
      return inflate;
    
    };
  };
  
  definitions["node_modules/js-git/package.json"] = function (module, exports) {
    module.exports = {
      "name": "js-git",
      "version": "0.5.2",
      "description": "Git Implemented in JavaScript",
      "main": "js-git.js",
      "repository": {
        "type": "git",
        "url": "git://github.com/creationix/js-git.git"
      },
      "devDependencies": {
        "git-fs-db": "~0.1.1",
        "git-net": "~0.0.3",
        "git-node-platform": "~0.1.4",
        "gen-run": "~0.1.1"
      },
      "keywords": [
        "git",
        "js-git"
      ],
      "author": "Tim Caswell <tim@creationix.com>",
      "license": "MIT",
      "bugs": {
        "url": "https://github.com/creationix/js-git/issues"
      },
      "dependencies": {
        "push-to-pull": "~0.1.0",
        "git-pack-codec": "~0.0.1"
      }
    }
  };
  
  definitions["node_modules/git-net/remote.js"] = function (module, exports) {
    var urlParse = require('node_modules/git-net/url-parse.js');
    module.exports = function (platform) {
      var tcp, http, ws, ssh;
      return processUrl;
      function processUrl(url) {
        var opts = urlParse(url);
        if (opts.protocol === "git:") {
          if (!platform.tcp) throw new Error("Platform does not support git: urls");
          tcp = tcp || require('node_modules/git-net/tcp.js')(platform);
          return tcp(opts);
        }
        if (opts.protocol === "http:" || opts.protocol === "https:") {
          if (!platform.http) throw new Error("Platform does not support http(s): urls");
          http = http || require('node_modules/git-net/smart-http.js')(platform);
          return http(opts);
        }
        if (opts.protocol === "ws:" || opts.protocol === "wss:") {
          if (!platform.ws) throw new Error("Platform does not support ws(s): urls");
          ws = ws || require('node_modules/git-net/ws.js')(platform);
          return ws(opts);
        }
        if (opts.protocol === "ssh:") {
          if (!platform.ssh) throw new Error("Platform does not support ssh: urls");
          ssh = ssh || require('node_modules/git-net/ssh.js')(platform);
          return ssh(opts);
        }
        throw new Error("Unknown protocol " + opts.protocol);
      }
    };
  };
  
  definitions["node_modules/git-net/url-parse.js"] = function (module, exports) {
    module.exports = urlParse;
    
    function urlParse(href) {
      var protocol, username, password, hostname, port, pathname, search, hash;
      var match, host, path;
      // Match URL style remotes
      if (match = href.match(/^(?:(wss?:|https?:|git:|ssh:)\/\/)([^\/]+)([^:]+)$/)) {
        protocol = match[1],
        host = match[2];
        path = match[3];
        match = host.match(/^(?:([^@:]+)(?::([^@]+))?@)?([^@:]+)(?::([0-9]+))?$/);
        username = match[1];
        password = match[2];
        hostname = match[3];
        port = match[4];
        match = path.match(/^([^?]*)(\?[^#]*)?(#.*)?$/);
        pathname = match[1];
        if (protocol === "ssh:") pathname = pathname.substr(1);
        search = match[2];
        hash = match[3];
      }
      // Match scp style ssh remotes
      else if (match = href.match(/^(?:([^@]+)@)?([^:\/]+)([:\/][^:\/][^:]+)$/)) {
        protocol = "ssh:";
        username = match[1];
        host = hostname = match[2];
        path = pathname = match[3];
        if (pathname[0] === ":") pathname = pathname.substr(1);
      }
      else {
        throw new Error("Uknown URL format: " + href);
      }
    
      if (port) port = parseInt(port, 10);
      else if (protocol === "http:" || protocol === "ws:") port = 80;
      else if (protocol === "https:" || protocol === "wss:") port = 443;
      else if (protocol === "ssh:") port = 22;
      else if (protocol === "git:") port = 9418;
    
      var opt = {
        href: href,
        protocol: protocol
      };
      if (username) {
        opt.username = username;
        if (password) {
          opt.password = password;
          opt.auth = username + ":" + password;
        }
        else {
          opt.auth = username;
        }
      }
      opt.host = host;
      opt.hostname = hostname;
      opt.port = port;
      opt.path = path;
      opt.pathname = pathname;
      if (search) opt.search = search;
      if (hash) opt.hash = hash;
    
      return opt;
    }
  };
  
  definitions["node_modules/git-net/tcp.js"] = function (module, exports) {
    module.exports = function (platform) {
      var writable = require('node_modules/git-net/writable.js');
      var sharedFetch = require('node_modules/git-net/fetch.js');
      var sharedDiscover = require('node_modules/git-net/discover.js');
      var pushToPull = require('node_modules/git-net/node_modules/push-to-pull/transform.js');
      var pktLine = require('node_modules/git-net/pkt-line.js')(platform);
      var framer = pushToPull(pktLine.framer);
      var deframer = pushToPull(pktLine.deframer);
      var tcp = platform.tcp;
      var trace = platform.trace;
    
      // opts.hostname - host to connect to (github.com)
      // opts.pathname - path to repo (/creationix/conquest.git)
      // opts.port - override default port (9418)
      return function (opts) {
    
        var connection;
    
        opts.discover = discover;
        opts.fetch = fetch;
        opts.close = closeConnection;
        return opts;
    
        function connect(callback) {
          return tcp.connect(opts.port, opts.hostname, function (err, socket) {
            if (err) return callback(err);
            var input = deframer(socket);
            if (trace) input = trace("input", input);
    
            var output = writable(input.abort);
            connection = {
              read: input.read,
              abort: input.abort,
              write: output
            };
            if (trace) output = trace("output", output);
            output = framer(output);
            socket.sink(output)(function (err) {
              if (err) console.error(err.stack || err);
              // TODO: handle this better somehow
              // maybe allow writable streams
            });
            callback();
          });
        }
    
        // Send initial git-upload-pack request
        // outputs refs and caps
        function discover(callback) {
          if (!callback) return discover.bind(this);
          if (!connection) {
            return connect(function (err) {
              if (err) return callback(err);
              return discover(callback);
            });
          }
          connection.write("git-upload-pack " + opts.pathname + "\0host=" + opts.hostname + "\0");
          sharedDiscover(connection, callback);
        }
    
        function fetch(repo, opts, callback) {
          if (!callback) return fetch.bind(this, repo, opts);
          if (!connection) {
            return callback(new Error("Please connect before fetching"));
          }
          return sharedFetch(connection, repo, opts, callback);
        }
    
        function closeConnection(callback) {
          if (!callback) return closeConnection.bind(this);
          connection.write();
          callback();
        }
      };
    };
  };
  
  definitions["node_modules/git-net/fetch.js"] = function (module, exports) {
    var deline = require('node_modules/git-net/deline.js');
    module.exports = fetch;
    function fetch(socket, repo, opts, callback) {
    
      var read = socket.read,
          write = socket.write,
          abort = socket.abort;
      var onProgress = opts.onProgress,
          onError = opts.onError,
          wants = opts.wants,
          depth = opts.depth,
          caps = opts.caps;
      var cb;
    
      if (opts.deline) {
        if (onProgress) onProgress = deline(onProgress);
        if (onError) onError = deline(onError);
      }
    
      if (!wants.length) {
        write(null);
        write("done\n");
        return callback();
      }
    
      return repo.listRefs("refs", onRefs);
    
      function onRefs(err, refs) {
        if (err) return callback(err);
    
        // want-list
        for (var i = 0, l = wants.length; i < l; ++i) {
          write("want " + wants[i] + (i === 0 ? " " + caps.join(" ") : "") + "\n");
        }
        if (depth) {
          write("deepen " + depth + "\n");
        }
        write(null);
    
        // have-list
        for (var ref in refs) {
          write("have " + refs[ref] + "\n");
        }
    
        // compute-end
        write("done\n");
        return read(onResponse);
      }
    
      function onResponse(err, resp) {
        if (err) return callback(err);
        if (resp === undefined) return callback(new Error("Server disconnected"));
        if (resp === null) return read(onResponse);
        var match = resp.match(/^([^ \n]*)(?: (.*))?/);
        var command = match[1];
        var value = match[2];
        if (command === "shallow") {
          return repo.createRef("shallow", value, onShallow);
        }
        if (command === "NAK" || command === "ACK") {
          return callback(null, { read: packRead, abort: abort });
        }
        return callback(new Error("Unknown command " + command + " " + value));
      }
    
      function onShallow(err) {
        if (err) return callback(err);
        return read(onResponse);
      }
    
      function packRead(callback) {
        if (cb) return callback(new Error("Only one read at a time"));
        cb = callback;
        return read(onItem);
      }
    
      function onItem(err, item) {
        var callback = cb;
        if (item === undefined) {
          cb = null;
          return callback(err);
        }
        if (item) {
          if (item.progress) {
            if (onProgress) onProgress(item.progress);
            return read(onItem);
          }
          if (item.error) {
            if (onError) onError(item.error);
            return read(onItem);
          }
        }
        if (!item) return read(onItem);
        cb = null;
        return callback(null, item);
      }
    }
  };
  
  definitions["node_modules/git-net/deline.js"] = function (module, exports) {
    module.exports = function deline(emit) {
      var buffer = "";
      return function (chunk) {
        var start = 0;
        for (var i = 0, l = chunk.length; i < l; ++i) {
          var c = chunk[i];
          if (c === "\r" || c === "\n") {
            buffer += chunk.substr(start, i - start + 1);
            start = i + 1;
            emit(buffer);
            buffer = "";
          }
        }
        buffer += chunk.substr(start);
      };
    };
  };
  
  definitions["node_modules/git-net/discover.js"] = function (module, exports) {
    module.exports = discover;
    function discover(socket, callback) {
      var read = socket.read;
    
      var refs = {};
      var caps = null;
    
      read(onLine);
    
      function onLine(err, line) {
        if (err) return callback(err);
        if (/^ERR \n/.test(line)) {
          return callback(new Error(line.substr(5).trim()));
        }
        if (line === null) {
          return callback(null, refs, caps);
        }
        line = line.trim();
        if (!caps) line = pullCaps(line);
        var index = line.indexOf(" ");
        refs[line.substr(index + 1)] = line.substr(0, index);
        read(onLine);
      }
    
      function pullCaps(line) {
        var index = line.indexOf("\0");
        caps = {};
        line.substr(index + 1).split(" ").map(function (cap) {
          var pair = cap.split("=");
          caps[pair[0]] = pair[1] || true;
        });
        return line.substr(0, index);
      }
    }
  };
  
  definitions["node_modules/git-net/node_modules/push-to-pull/transform.js"] = function (module, exports) {
    // input push-filter: (emit) -> emit
    // output is simple-stream pull-filter: (stream) -> stream
    module.exports = pushToPull;
    function pushToPull(parser) {
      return function (stream) {
      
        var write = parser(onData);
        var cb = null;
        var queue = [];
          
        return { read: read, abort: stream.abort };
        
        function read(callback) {
          if (queue.length) return callback(null, queue.shift());
          if (cb) return callback(new Error("Only one read at a time."));
          cb = callback;
          stream.read(onRead);
          
        }
    
        function onRead(err, item) {
          var callback = cb;
          cb = null;
          if (err) return callback(err);
          try {
            write(item);
          }
          catch (err) {
            return callback(err);
          }
          return read(callback);
        }
    
        function onData(item) {
          queue.push(item);
        }
    
      };
    }
  };
  
  definitions["node_modules/git-net/pkt-line.js"] = function (module, exports) {
    module.exports = function (platform) {
      var bops = platform.bops;
      var PACK = bops.from("PACK");
    
      return {
        deframer: deframer,
        framer: framer
      };
    
      function deframer(emit) {
        var state = 0;
        var offset = 4;
        var length = 0;
        var data;
    
        return function (item) {
    
          // Forward the EOS marker
          if (item === undefined) return emit();
    
          // Once we're in pack mode, everything goes straight through
          if (state === 3) return emit(item);
    
          // Otherwise parse the data using a state machine.
          for (var i = 0, l = item.length; i < l; i++) {
            var byte = item[i];
            if (state === 0) {
              var val = fromHexChar(byte);
              if (val === -1) {
                if (byte === PACK[0]) {
                  offset = 1;
                  state = 2;
                  continue;
                }
                state = -1;
                throw new SyntaxError("Not a hex char: " + String.fromCharCode(byte));
              }
              length |= val << ((--offset) * 4);
              if (offset === 0) {
                if (length === 4) {
                  offset = 4;
                  emit("");
                }
                else if (length === 0) {
                  offset = 4;
                  emit(null);
                }
                else if (length > 4) {
                  length -= 4;
                  data = bops.create(length);
                  state = 1;
                }
                else {
                  state = -1;
                  throw new SyntaxError("Invalid length: " + length);
                }
              }
            }
            else if (state === 1) {
              data[offset++] = byte;
              if (offset === length) {
                offset = 4;
                state = 0;
                length = 0;
                if (data[0] === 1) {
                  emit(bops.subarray(data, 1));
                }
                else if (data[0] === 2) {
                  emit({progress: bops.to(bops.subarray(data, 1))});
                }
                else if (data[0] === 3) {
                  emit({error: bops.to(bops.subarray(data, 1))});
                }
                else {
                  emit(bops.to(data));
                }
              }
            }
            else if (state === 2) {
              if (offset < 4 && byte === PACK[offset++]) {
                continue;
              }
              state = 3;
              emit(bops.join([PACK, bops.subarray(item, i)]));
              break;
            }
            else {
              throw new Error("pkt-line decoder in invalid state");
            }
          }
        };
    
      }
    
      function framer(emit) {
        return function (item) {
          if (item === undefined) return emit();
          if (item === null) {
            emit(bops.from("0000"));
            return;
          }
          if (typeof item === "string") {
            item = bops.from(item);
          }
          emit(bops.join([frameHead(item.length + 4), item]));
        };
      }
    
      function frameHead(length) {
        var buffer = bops.create(4);
        buffer[0] = toHexChar(length >>> 12);
        buffer[1] = toHexChar((length >>> 8) & 0xf);
        buffer[2] = toHexChar((length >>> 4) & 0xf);
        buffer[3] = toHexChar(length & 0xf);
        return buffer;
      }
    
      function fromHexChar(val) {
        return (val >= 0x30 && val <  0x40) ? val - 0x30 :
              ((val >  0x60 && val <= 0x66) ? val - 0x57 : -1);
      }
    
      function toHexChar(val) {
        return val < 0x0a ? val + 0x30 : val + 0x57;
      }
    
    };
  };
  
  definitions["node_modules/git-net/smart-http.js"] = function (module, exports) {
    module.exports = function (platform) {
      var writable = require('node_modules/git-net/writable.js');
      var sharedDiscover = require('node_modules/git-net/discover.js');
      var sharedFetch = require('node_modules/git-net/fetch.js');
      var pushToPull = require('node_modules/git-net/node_modules/push-to-pull/transform.js');
      var pktLine = require('node_modules/git-net/pkt-line.js')(platform);
      var framer = pushToPull(pktLine.framer);
      var deframer = pushToPull(pktLine.deframer);
      var http = platform.http;
      var trace = platform.trace;
      var bops = platform.bops;
      var agent = platform.agent;
      var urlParse = require('node_modules/git-net/url-parse.js');
    
      // opts.hostname - host to connect to (github.com)
      // opts.pathname - path to repo (/creationix/conquest.git)
      // opts.port - override default port (80 for http, 443 for https)
      return function (opts) {
        opts.tls = opts.protocol === "https:";
        opts.port = opts.port ? opts.port | 0 : (opts.tls ? 443 : 80);
        if (!opts.hostname) throw new TypeError("hostname is a required option");
        if (!opts.pathname) throw new TypeError("pathname is a required option");
    
        opts.discover = discover;
        opts.fetch = fetch;
        opts.close = closeConnection;
    
        var write, read, abort, cb, error, pathname, headers;
    
        return opts;
    
        function connect() {
          write = writable();
          var output = write;
          if (trace) output = trace("output", output);
          output = framer(output);
          read = null;
          abort = null;
          post(pathname, headers, output, onResponse);
        }
    
        function onResponse(err, code, headers, body) {
          if (err) return onError(err);
          if (code !== 200) return onError(new Error("Unexpected status code " + code));
          if (headers['content-type'] !== 'application/x-git-upload-pack-result') {
            return onError(new Error("Wrong content-type in server response"));
          }
          body = deframer(body);
          if (trace) body = trace("input", body);
          read = body.read;
          abort = body.abort;
    
          if (cb) {
            var callback = cb;
            cb = null;
            return read(callback);
          }
        }
    
        function onError(err) {
          if (cb) {
            var callback = cb;
            cb = null;
            return callback(err);
          }
          error = err;
        }
    
        function enqueue(callback) {
          if (error) {
            var err = error;
            error = null;
            return callback(err);
          }
          cb = callback;
        }
    
    
        function addDefaults(extras) {
    
          var headers = {
            "User-Agent": agent,
            "Host": opts.hostname,
          };
    
          // Hack to workaround gist bug.
          // https://github.com/creationix/js-git/issues/25
          if (opts.hostname === "gist.github.com") {
            headers["User-Agent"] = "git/1.8.1.2";
            headers["X-Real-User-Agent"] = agent;
          }
    
          for (var key in extras) {
            headers[key] = extras[key];
          }
          return headers;
        }
    
        function get(path, headers, callback) {
          return http.request({
            method: "GET",
            hostname: opts.hostname,
            tls: opts.tls,
            port: opts.port,
            auth: opts.auth,
            path: opts.pathname + path,
            headers: addDefaults(headers)
          }, onGet);
    
          function onGet(err, code, responseHeaders, body) {
            if (err) return callback(err);
            if (code === 301) {
              var uri = urlParse(responseHeaders.location);
              opts.protocol = uri.protocol;
              opts.hostname = uri.hostname;
              opts.tls = uri.protocol === "https:";
              opts.port = uri.port;
              opts.auth = uri.auth;
              opts.pathname = uri.path.replace(path, "");
              return get(path, headers, callback);
            }
            return callback(err, code, responseHeaders, body);
          }
        }
    
        function buffer(body, callback) {
          var parts = [];
          body.read(onRead);
          function onRead(err, item) {
            if (err) return callback(err);
            if (item === undefined) {
              return callback(null, bops.join(parts));
            }
            parts.push(item);
            body.read(onRead);
          }
        }
    
        function post(path, headers, body, callback) {
          headers = addDefaults(headers);
          if (typeof body === "string") {
            body = bops.from(body);
          }
          if (bops.is(body)) {
            headers["Content-Length"] = body.length;
          }
          else {
            if (headers['Transfer-Encoding'] !== 'chunked') {
              return buffer(body, function (err, body) {
                if (err) return callback(err);
                headers["Content-Length"] = body.length;
                send(body);
              });
            }
          }
          send(body);
          function send(body) {
            http.request({
              method: "POST",
              hostname: opts.hostname,
              tls: opts.tls,
              port: opts.port,
              auth: opts.auth,
              path: opts.pathname + path,
              headers: headers,
              body: body
            }, callback);
          }
        }
    
        // Send initial git-upload-pack request
        // outputs refs and caps
        function discover(callback) {
          if (!callback) return discover.bind(this);
          get("/info/refs?service=git-upload-pack", {
            "Accept": "*/*",
            "Accept-Encoding": "gzip",
            "Pragma": "no-cache"
          }, function (err, code, headers, body) {
            if (err) return callback(err);
            if (code !== 200) return callback(new Error("Unexpected status code " + code));
            if (headers['content-type'] !== 'application/x-git-upload-pack-advertisement') {
              return callback(new Error("Wrong content-type in server response"));
            }
    
            body = deframer(body);
            if (trace) body = trace("input", body);
    
            body.read(function (err, line) {
              if (err) return callback(err);
              if (line.trim() !== '# service=git-upload-pack') {
                return callback(new Error("Missing expected service line"));
              }
              body.read(function (err, line) {
                if (err) return callback(err);
                if (line !== null) {
                  return callback(new Error("Missing expected terminator"));
                }
                sharedDiscover(body, callback);
              });
            });
          });
        }
    
        function fetch(repo, opts, callback) {
          if (!callback) return fetch.bind(this, repo, opts);
          pathname = "/git-upload-pack";
          headers = {
            "Content-Type": "application/x-git-upload-pack-request",
            "Accept": "application/x-git-upload-pack-result",
          };
    
          return sharedFetch({
            read: resRead,
            abort: resAbort,
            write: resWrite
          }, repo, opts, callback);
        }
    
        function resRead(callback) {
          if (read) return read(callback);
          return enqueue(callback);
        }
    
        function resAbort(callback) {
          if (abort) return abort(callback);
          return callback();
        }
    
        function resWrite(line) {
          if (!write) connect();
          if (line === "done\n") {
            write(line);
            write();
            write = null;
          }
          else {
            write(line);
          }
        }
    
        function closeConnection(callback) {
          if (!callback) return closeConnection.bind(this);
          callback();
        }
      };
    };
  };
  
  definitions["node_modules/git-net/ws.js"] = function (module, exports) {};
  
  definitions["node_modules/git-net/ssh.js"] = function (module, exports) {
    module.exports = function (platform) {
      var writable = require('node_modules/git-net/writable.js');
      var sharedFetch = require('node_modules/git-net/fetch.js');
      var sharedDiscover = require('node_modules/git-net/discover.js');
      var pushToPull = require('node_modules/git-net/node_modules/push-to-pull/transform.js');
      var trace = platform.trace;
      var pktLine = require('node_modules/git-net/pkt-line.js')(platform);
      var framer = pushToPull(pktLine.framer);
      var deframer = pushToPull(pktLine.deframer);
      var ssh = platform.ssh;
    
      // opts.hostname - host to connect to (github.com)
      // opts.pathname - path to repo (/creationix/conquest.git)
      // opts.port - override default port (22)
      // opts.auth - username:password or just username
      // opts.privateKey - binary contents of private key to use.
      return function (opts) {
        if (!opts.hostname) throw new TypeError("hostname is a required option");
        if (!opts.pathname) throw new TypeError("pathname is a required option");
    
        var tunnel, connection;
    
        opts.discover = discover;
        opts.fetch = fetch;
        opts.close = closeConnection;
        return opts;
    
        function connect(command, callback) {
          if (connection) return callback();
          ssh(opts, function (err, result) {
            if (err) return callback(err);
            tunnel = result;
            tunnel.exec(command, function (err, socket) {
              if (err) return callback(err);
              var input = deframer(socket);
              if (trace) input = trace("input", input);
    
              var output = writable(input.abort);
              connection = {
                read: input.read,
                abort: input.abort,
                write: output
              };
              if (trace) output = trace("output", output);
              output = framer(output);
              socket.sink(output)(function (err) {
                throw err;
                // TODO: handle this better somehow
                // maybe allow writable streams
              });
              callback();
            });
          });
        }
    
        // Send initial git-upload-pack request
        // outputs refs and caps
        function discover(callback) {
          if (!callback) return discover.bind(this);
          if (!connection) {
            return connect("git-upload-pack", function (err) {
              if (err) return callback(err);
              return discover(callback);
            });
          }
          sharedDiscover(connection, callback);
        }
    
        function fetch(repo, opts, callback) {
          if (!callback) return fetch.bind(this, repo, opts);
          if (!connection) {
            return callback(new Error("Please connect before fetching"));
          }
          return sharedFetch(connection, repo, opts, callback);
        }
    
        function closeConnection(callback) {
          if (!callback) return closeConnection.bind(this);
          connection.write();
          tunnel.close();
          callback();
        }
    
      };
    
    };
  };
  
  definitions["node_modules/git-localdb/localdb.js"] = function (module, exports) {
    function makeAsync(fn, callback) {
      if (!callback) return makeAsync.bind(this, fn);
      setImmediate(function () {
        var result;
        try { result = fn(); }
        catch (err) { return callback(err); }
        if (result === undefined) return callback();
        return callback(null, result);
      });
    }
    
    var deflate, inflate;
    module.exports = function (platform) {
      deflate = platform.deflate || fake;
      inflate = platform.inflate || fake;
      return localDb;
    };
    
    function fake(input, callback) {
      setImmediate(function () {
        callback(null, input);
      });
    }
    
    function localDb(prefix) {
    
      var refs;
      var isHash = /^[a-z0-9]{40}$/;
    
      return {
        get: get,
        set: set,
        has: has,
        del: del,
        keys: keys,
        init: init,
        clear: clear
      };
    
      function get(key, callback) {
        if (!callback) return get.bind(this, key);
        if (isHash.test(key)) {
          var raw = localStorage.getItem(key);
          if (!raw) return;
          var length = raw.length;
          var buffer = new Uint8Array(length);
          for (var i = 0; i < length; ++i) {
            buffer[i] = raw.charCodeAt(i);
          }
          return inflate(buffer, callback);
        }
        setImmediate(function () {
          callback(null, refs[key]);
        });
      }
    
      function set(key, value, callback) {
        if (!callback) return set.bind(this, key, value);
        if (isHash.test(key)) {
          return deflate(value, function (err, deflated) {
            var raw = "";
            for (var i = 0, l = deflated.length; i < l; ++i) {
              raw += String.fromCharCode(deflated[i]);
            }
            try {
              localStorage.setItem(key, raw);
            }
            catch (err) {
              return callback(err);
            }
            callback();
          });
        }
        refs[key] = value.toString();
        localStorage.setItem(prefix, JSON.stringify(refs));
        setImmediate(callback);
      }
    
      function has(key, callback) {
        return makeAsync(function () {
          if (isHash.test(key)) {
            return !!localStorage.getItem(key);
          }
          return key in refs;
        }, callback);
      }
    
      function del(key, callback) {
        return makeAsync(function () {
          if (isHash.test(key)) {
            localStorage.removeItem(key);
          }
          else {
            delete refs[key];
          }
        }, callback);
      }
    
      function keys(prefix, callback) {
        return makeAsync(function () {
          var list = Object.keys(refs);
          if (!prefix) return list;
          var length = prefix.length;
          return list.filter(function (key) {
            return key.substr(0, length) === prefix;
          }).map(function (key) {
            return key.substr(length);
          });
        }, callback);
      }
    
      function init(callback) {
        return makeAsync(function () {
          var json = localStorage.getItem(prefix);
          if (!json) {
            refs = {};
            return;
          }
          refs = JSON.parse(json);
        }, callback);
      }
    
      function clear(callback) {
        return makeAsync(function () {
          refs = {};
          localStorage.removeItem(prefix);
          // We don't know all the hashes that were used by only this database
          // so just kill everything so save space.
          localStorage.clear();
        }, callback);
      }
    }
  };
  
  function require(name) {
    if (name in modules) return modules[name];
    if (!(name in definitions)) return realRequire(name);
    var exports = {};
    var module = {exports:exports};
    modules[name] = module.exports;
    definitions[name](module, exports);
    return modules[name] = module.exports;
  }
  
  require("src/core.js");
}(typeof require === 'function' ? require : console.error.bind(console, 'Missing Module')));