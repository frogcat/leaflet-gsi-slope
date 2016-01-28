(function() {

  var getJSON = function(url) {
    return new Promise(function(resolve, reject) {
      var x = new XMLHttpRequest();
      x.onreadystatechange = function() {
        if (x.readyState == 4) {
          if (x.status == 200)
            resolve(JSON.parse(x.responseText));
          else
            reject();
        }
      };
      x.open("get", url, true);
      x.send();
    });
  };

  var parseDEM = function(txt) {
    var dem = [];
    txt.split("\n").forEach(function(row) {
      if (row.indexOf(",") == -1)
        return;
      var b = [];
      row.split(",").forEach(function(col) {
        b.push(parseFloat(col));
      });
      dem.push(b);
    });
    return dem;
  };

  var getDEM = function(url) {
    return new Promise(function(resolve, reject) {
      var x = new XMLHttpRequest();
      x.onreadystatechange = function() {
        if (x.readyState == 4) {
          if (x.status == 200)
            resolve(parseDEM(x.responseText));
          else
            reject();
        }
      };
      x.open("get", url, true);
      x.send();
    });
  };

  var SlopeLayer = L.GridLayer.extend({
    options: {
      minZoom: 16,
      maxZoom: 16,
      maxNativeZoom: 16,
      attribution: "<a href='https://github.com/gsi-cyberjapan/vector-tile-experiment'>国土地理院ベクトルタイル提供実験(道路中心線,DEM5A)</a>"
    },
    createTile: function(coords) {
      var map = this._map;
      var tile = L.DomUtil.create('canvas', 'leaflet-tile');
      tile.width = 256;
      tile.height = 256;

      if (!this._cache)
        this._cache = {};
      var cache = this._cache;

      var url1 = L.Util.template("http://cyberjapandata.gsi.go.jp/xyz/experimental_rdcl/{z}/{x}/{y}.geojson", coords);
      var url2 = L.Util.template("http://cyberjapandata.gsi.go.jp/xyz/dem/{z}/{x}/{y}.txt", {
        x: Math.floor(coords.x / 4),
        y: Math.floor(coords.y / 4),
        z: 14
      });

      if (!cache[url1])
        cache[url1] = getJSON(url1);
      if (!cache[url2])
        cache[url2] = getDEM(url2);

      Promise.all([cache[url1], cache[url2]]).then(function(a) {
        var json = a[0];
        var dem = a[1];
        var lines = [];
        json.features.forEach(function(feature) {
          var o = null;
          feature.geometry.coordinates.forEach(function(p) {
            p = L.latLng(p[1], p[0]);
            var q = map.project(p, 16);
            p.x = q.x - coords.x * 256;
            p.y = q.y - coords.y * 256;

            var r = map.project(p, 14);
            var ix = Math.floor(r.x - Math.floor(coords.x / 4) * 256);
            var iy = Math.floor(r.y - Math.floor(coords.y / 4) * 256);
            ix = Math.min(255, Math.max(0, ix));
            iy = Math.min(255, Math.max(0, iy));
            p.alt = dem[iy][ix];
            if (o != null) {
              var t = Math.abs((p.alt - o.alt) / p.distanceTo(o));
              lines.push([o, p, t]);
            }
            o = p;
          });
        });

        var ctx = tile.getContext("2d");
        lines.forEach(function(line) {
          ctx.lineWidth = 6;
          ctx.strokeStyle = "#000";
          ctx.fillStyle = "none";
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(line[0].x, line[0].y);
          ctx.lineTo(line[1].x, line[1].y);
          ctx.stroke();
        });

        lines.forEach(function(line) {
          var t = Math.min(1, line[2] / 0.10);
          ctx.strokeStyle = "hsl(250,100%," + (1 - t) * 100 + "%)";
          //          ctx.strokeStyle = "hsl(" + (120 - 120 * t) + ",100%,40%)";
          ctx.lineWidth = 4;
          ctx.fillStyle = "none";
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(line[0].x, line[0].y);
          ctx.lineTo(line[1].x, line[1].y);
          ctx.stroke();
        });
      });
      return tile;
    }
  });

  L.slopeLayer = function() {
    return new SlopeLayer()
  };

})();