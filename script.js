(function() {

  var cache = {};

  var ajax = function(url) {
    if (!cache[url])
      cache[url] = new Promise(function(resolve, reject) {
        var x = new XMLHttpRequest();
        x.onreadystatechange = function() {
          if (x.readyState == 4)
            resolve(x.status == 200 ? x.responseText : null);
        };
        x.open("get", url, true);
        x.send();
      });
    return cache[url];
  };

  var points = function(obj) {
    if (obj.features)
      obj = obj.features;
    else if (obj.geometry && obj.geometry.coordinates)
      obj = obj.geometry.coordinates;
    if (obj.forEach) {
      if (obj.length > 1 && isFinite(obj[0]) && isFinite(obj[1]))
        return [obj];
      var a = [];
      obj.forEach(function(b) {
        a = a.concat(points(b));
      });
      return a;
    }
    return [];
  };

  var parseDEM = function(txt) {
    var a = [];
    txt.split("\n").forEach(function(row) {
      if (row.indexOf(",") == -1) return;
      var b = [];
      row.split(",").forEach(function(col) {
        b.push(parseFloat(col));
      });
      a.push(b);
    });
    return a;
  };

  var geojson = function(template1, coords1) {
    var coords2 = coords1.clone();
    if (coords1.z > 14) {
      coords2 = coords2.divideBy(Math.pow(2, coords1.z - 14)).floor();
      coords2.z = 14
    }
    var template2 = "http://cyberjapandata.gsi.go.jp/xyz/dem/{z}/{x}/{y}.txt";
    var promise1 = ajax(L.Util.template(template1, coords1));
    var promise2 = ajax(L.Util.template(template2, coords2));
    return new Promise(function(resolve, reject) {
      Promise.all([promise1, promise2]).then(function(a) {
        var json = JSON.parse(a[0]) || {
          type: "FeatureCollection",
          features: []
        };
        var dem = parseDEM(a[1]);
        points(json).forEach(function(p) {
          var ll = L.GeoJSON.coordsToLatLng(p);
          var xy = L.CRS.EPSG3857.latLngToPoint(ll, coords2.z).floor();
          p.push(dem[xy.y % 256][xy.x % 256]);
        });
        resolve(json);
      });
    });
  };

  var MyLayer = L.LayerGroup.extend({
    options: {
      attribution: "",
      zoom: 15,
      minZoom: 15,
      maxZoom: 20
    },
    initialize: function(tmpl, options, geojson2layers) {
      L.Util.setOptions(this, options);
      this._tmpl = tmpl;
      this._geojson2layers = geojson2layers;
      L.LayerGroup.prototype.initialize.call(this);
    },
    getAttribution: function() {
      return this.options.attribution;
    },
    onAdd: function(map) {
      L.LayerGroup.prototype.onAdd.call(this, map);
      this._update();
    },
    getEvents: function() {
      return {
        zoomend: this._update,
        moveend: this._update,
        viewreset: this._update
      };
    },
    _update: function() {
      var map = this._map;
      var opt = this.options;

      if (map.getZoom() < opt.minZoom || opt.maxZoom < map.getZoom()) {
        this.clearLayers();
        return;
      }

      var layers = [];
      var b = this._map.getBounds();
      var tl = map.project(b.getNorthWest(), opt.zoom).divideBy(256).floor();
      var br = map.project(b.getSouthEast(), opt.zoom).divideBy(256).ceil();
      for (var y = tl.y; y < br.y; y++) {
        for (var x = tl.x; x < br.x; x++) {
          var coords = L.point(x, y);
          coords.z = opt.zoom;
          layers.push(this._load(coords));
        }
      }

      this.getLayers().forEach(function(layer) {
        if (layers.indexOf(layer) == -1)
          this.removeLayer(layer);
      }, this);

    },
    _load: function(coords) {
      var key = [coords.x, coords.y].join("/");
      var cnt = null;
      this.getLayers().forEach(function(layer) {
        if (layer.__coords == key)
          cnt = layer;
      });

      if (cnt)
        return cnt;

      cnt = L.layerGroup();
      this.addLayer(cnt);
      cnt.__coords = key;

      var that = this;
      geojson(this._tmpl, L.extend(this.options, coords)).then(function(json) {
        that._geojson2layers(json).forEach(function(layer) {
          cnt.addLayer(layer);
        });
      });
      return cnt;
    }

  });


  var geojson2layers = function(json) {
    var a = [];
    json.features.forEach(function(feature) {
      var o = null;
      feature.geometry.coordinates.forEach(function(b) {
        var p = L.GeoJSON.coordsToLatLng(b);
        p.alt = b[2];
        if (o != null) {
          var latlngs = (o.alt < p.alt ? [o, p] : [p, o]);
          var kobai = Math.round(Math.abs(p.alt - o.alt) / p.distanceTo(o) * 100);
          kobai = (isNaN(kobai) ? 0 : Math.min(kobai, 12));
          a.push(L.polyline(latlngs, {
            className: "slope slope" + (kobai)
          }));
          a.push(L.polyline(latlngs, {
            color: 'black',
            weight: 8,
            pane: 'tilePane'
          }));
        }
        o = p;
      });
    });
    return a;
  };



  var map = L.map("map", L.extend({
    maxZoom: 20,
    minZoom: 2
  }, L.Hash.parseHash(location.hash) || {
    zoom: 15,
    center: [35.6707, 139.7852]
  }));

  map.zoomControl.setPosition("bottomright");
  L.hash(map);

  var tmpl = "http://cyberjapandata.gsi.go.jp/xyz/{id}/{z}/{x}/{y}.{ext}";

  L.control.layers({
    "オルソ画像": L.tileLayer(tmpl, {
      "id": "ort",
      "ext": "jpg",
      "attribution": "<a href='http://maps.gsi.go.jp/development/ichiran.html#ort'>写真(地理院タイル)</a>"
    }).addTo(map),
    "標準地図": L.tileLayer(tmpl, {
      "id": "std",
      "ext": "png",
      "attribution": "<a href='http://maps.gsi.go.jp/development/ichiran.html#std'>標準地図(地理院タイル)</a>"
    })
  }, {
    "注記": new MyLayer(tmpl, {
      "id": "experimental_anno",
      "ext": "geojson",
      "attribution": "<a href='https://github.com/gsi-cyberjapan/experimental_anno/'>注記(ベクトルタイル提供実験)</a>)",
      "zoom": 15,
      "minZoom": 15,
      "maxZoom": 20
    }, function(json) {
      var a = [];
      json.features.forEach(function(feature) {
        a.push(L.marker(L.GeoJSON.coordsToLatLng(feature.geometry.coordinates), {
          icon: L.divIcon({
            className: "geojson-anno",
            html: feature.properties.knj
          })
        }));
      });
      return a;
    }).addTo(map),
    "道路": new MyLayer(tmpl, {
      "id": "experimental_rdcl",
      "ext": "geojson",
      "attribution": "<a href='https://github.com/gsi-cyberjapan/vector-tile-experiment'>道路中心線(ベクトルタイル提供実験)</a>)",
      "zoom": 16,
      "minZoom": 16,
      "maxZoom": 20
    }, geojson2layers).addTo(map),
    "河川": new MyLayer(tmpl, {
      "id": "experimental_rvrcl",
      "ext": "geojson",
      "attribution": "<a href='https://github.com/gsi-cyberjapan/vector-tile-experiment'>河川中心線(ベクトルタイル提供実験)</a>)",
      "zoom": 16,
      "minZoom": 15,
      "maxZoom": 20
    }, geojson2layers)
  }).addTo(map);

})();
