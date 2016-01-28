var SlopeLayer = L.GridLayer.extend({
  options : {
    minZoom : 16,
    maxZoom : 16,
    maxNativeZoom : 16,
    attribution : "<a href='https://github.com/gsi-cyberjapan/vector-tile-experiment'>"
        + "国土地理院ベクトルタイル提供実験(道路中心線,DEM5A)</a>",
    _url : "http://cyberjapandata.gsi.go.jp/xyz/experimental_rdcl/{z}/{x}/{y}.geojson"
  },
  _load : function(url) {
    return new Promise(function(resolve, reject) {
      var x = new XMLHttpRequest();
      x.onreadystatechange = function() {
        if (x.readyState == 4) {
          if (x.status == 200)
            resolve(x.responseText);
          else
            reject();
        }
      };
      x.open("get", url, true);
      x.send();
    });
  },
  createTile : function(coords) {
    var map = this._map;
    var tile = L.DomUtil.create('canvas', 'leaflet-tile');
    tile.width = 256;
    tile.height = 256;

    var urls = [];
    urls.push(L.Util.template(this.options._url, coords));
    for (var y = 0; y < 4; y++) {
      for (var x = 0; x < 4; x++) {
        urls.push(L.Util.template("http://cyberjapandata.gsi.go.jp/xyz/experimental_dem5a/{z}/{x}/{y}.geojson", {
          x : coords.x * 4 + x,
          y : coords.y * 4 + y,
          z : 18
        }));
      }
    }

    if (!this._cache)
      this._cache = {};

    var promises = [];
    urls.forEach(function(url) {
      if (!this._cache[url])
        this._cache[url] = this._load(url);
      promises.push(this._cache[url]);
    }, this);

    Promise.all(promises).then(function(a) {
      var db = [];
      a.forEach(function(v, i) {
        if (i == 0)
          return;
        JSON.parse(v).features.forEach(function(f) {
          db.push({
            lng : f.geometry.coordinates[0],
            lat : f.geometry.coordinates[1],
            alt : f.properties.alti
          });
        });
      });
      db.sort(function(a, b) {
        return a.lat == b.lat ? a.lng - b.lng : a.lat - b.lat;
      });

      var tbl = [];
      var old = null;
      db.forEach(function(v) {
        if (!old || old.lat != v.lat)
          tbl.push([ v ]);
        else
          tbl[tbl.length - 1].push(v);
        old = v;
      });

      var lines = [];
      JSON.parse(a[0]).features.forEach(function(feature) {
        var o = null;
        feature.geometry.coordinates.forEach(function(p) {
          var dist = Number.POSITIVE_INFINITY;
          var row = null;
          tbl.forEach(function(v) {
            var a = Math.abs(v[0].lat - p[1]);
            if (a < dist) {
              row = v;
              dist = a;
            }
          });

          var alt = NaN;
          dist = Number.POSITIVE_INFINITY;
          row.forEach(function(v) {
            var a = Math.abs(v.lng - p[0]);
            if (a < dist) {
              alt = v.alt;
              dist = a;
            }
          });

          p = map.project(L.latLng(p[1], p[0]), 16);
          p.x = p.x - coords.x * 256;
          p.y = p.y - coords.y * 256;
          p.alt = alt;
          if (o != null)
            lines.push([ o, p ]);
          o = p;
        });
      });

      var ctx = tile.getContext("2d");
      lines.forEach(function(line) {
        ctx.lineWidth = 6;
        ctx.strokeStyle = "#444";
        ctx.fillStyle = "none";
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(line[0].x, line[0].y);
        ctx.lineTo(line[1].x, line[1].y);
        ctx.stroke();
      });

      lines.forEach(function(line) {
        var dx = line[0].x - line[1].x;
        var dy = line[0].y - line[1].y;
        var da = line[0].alt - line[1].alt;
        var v = Math.abs(da / Math.sqrt(dx * dx + dy * dy));
        ctx.strokeStyle = "hsl(10,100%," + Math.floor(100 - v * 300) + "%)";

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
