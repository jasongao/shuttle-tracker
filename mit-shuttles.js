fitOnParse = false;
refreshTimeout = 10000;
L.mapbox.accessToken = 'pk.eyJ1IjoiamFzb25nYW8iLCJhIjoiWEFEbnplWSJ9.z_4HeYl01RN0tYSK6DxpbQ';
nextbusRequests = [
  {
    "agency": "mit",
    "route": ""
  },
  {
    "agency": "mbta",
    "route": "47"
  },
/*
  {
    "agency": "mbta",
    "route": "1"
  }
*/
];

x2js = new X2JS();
firstFit = false;
refreshButton = null;
getVehiclesTimeoutId = null;


function constructGeoJSONAll() {
  geoJSON = {};
  geoJSON.type = "FeatureCollection";
  geoJSON.features = [];
  
  nextbusRequests.forEach(function(nextbusRequest){
    var features = vehiclesToGeoJSONFeatures(nextbusRequest);
    geoJSON.features = geoJSON.features.concat(features);
  });
  
  return geoJSON;
}

function vehiclesToGeoJSONFeatures(nextbusRequest) {
  var vehicles = nextbusRequest.vehicles;
  var geoJSON = [];

  console.log("Parsing " + vehicles.length + " vehicles...");
  for (var i = 0; i < vehicles.length; i++) {  
    var v = vehicles[i];

    // Find which route this vehicle is on
    var r = findRoute(nextbusRequest.agency, v._routeTag);
    if (r === null) {
      console.log("Couldn't find matching route for vehicle routeTag " + v._routeTag);
      v._title = v._routeTag;
      v._color = "0000ff";
    } else {
      // Add route line segments and stop markers
      // TODO refactor so it's called once per route rather than per vehicle
      geoJSON = geoJSON.concat(getPathFeaturesFromRoute(r));
      //geoJSON = geoJSON.concat(getStopFeaturesFromRoute(r));

      // Add in vehicle display details
      v._title = r._title;
      v._color = r._color;
    }

    // Create a GeoJSON Point Feature for this vehicle from the info in the XML
    var description;
    if (typeof(v._speedKmHr) !== "undefined") {
      //description = v._secsSinceReport + " sec ago | " + v._speedKmHr + " km/h | heading " + v._heading
      description = v._secsSinceReport + " sec ago | " + v._speedKmHr + " km/h"
    } else {
      description = v._secsSinceReport + " sec ago"
    }
    var v_out = {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [v._lon, v._lat]
      },
      "properties": {
        "title": v._title,
        "description": description,
        "heading": v._heading,
        "marker-color": v._color,
        "marker-size": "medium",
        "marker-symbol": "bus"
      }
    };

    geoJSON.push(v_out);
  }
  
  return geoJSON;
}


function getStopFeaturesFromRoute(r) {
  features = [];

  for (var i = 0; i < r.stop.length; i++) {
    s = r.stop[i];

    var p = {};

    p.type = "Feature";

    p.properties = {};
    p.properties["marker-color"] = "#" + r._color;
    p.properties["marker-size"] = "small";
    p.properties["marker-symbol"] = "circle";
    p.properties["title"] = s._title;

    p.geometry = {};
    p.geometry.type = "Point";
    p.geometry.coordinates = [s._lon, s._lat];

    features.push(p);
  }

  return features;
}


function getPathFeaturesFromRoute(r) {
  console.log("Parsing route " + r._tag);
  features = [];

  for (var i = 0; i < r.path.length; i++) {
    pathSegment = r.path[i];

    var ls = {};

    ls.type = "Feature";

    ls.properties = {};
    ls.properties.stroke = "#" + r._color;
    ls.properties["stroke-width"] = 2;
    ls.properties["stroke-opacity"] = 1.0;

    ls.geometry = {};
    ls.geometry.type = "LineString";
    ls.geometry.coordinates = [];

    for (var j = 0; j < pathSegment.point.length; j++) {
      p = pathSegment.point[j];
      ls.geometry.coordinates.push([p._lon, p._lat]);
    }
    
    features.push(ls);
  }

  return features;
}


function rotateMarkers() {
  featureLayer.eachLayer(function(marker) {
    if (typeof marker._icon === 'undefined') {
      return;
    }
    
    var angle = marker.feature.properties.heading - 180;
    
    // MIT-licensed code by Benjamin Becquet
    // https://github.com/bbecquet/Leaflet.PolylineDecorator
    marker._setPos = function(pos) {
      L.Marker.prototype._setPos.call(this, pos);
      if (L.DomUtil.TRANSFORM) {
        // use the CSS transform rule if available
        this._icon.style[L.DomUtil.TRANSFORM] += ' rotate(' + angle + 'deg)';
      }
    }
    if (L.DomUtil.TRANSFORM) {
      // use the CSS transform rule if available
      marker._icon.style[L.DomUtil.TRANSFORM] += ' rotate(' + angle + 'deg)';
    }
    
    
  });
}


function findRoute(agency, tag) {
  var routes = [];
  nextbusRequests.forEach(function(nextbusRequest) {
    if (nextbusRequest.agency === agency) {
      if (nextbusRequest.route === "" || nextbusRequest.route === tag) {
        routes = nextbusRequest.routes;
      }
    }
  });
  
  for (var i = 0; i < routes.length; i++) {
    if (routes[i]._tag === tag) {
      return routes[i];
    }
  }
  
  return null;
}


// Add a randomized GET parameter to prevent caching by ISP / network

function randomizeUrl(url) {
  return url + "&anticache=" + new Date().getTime();
}


function nextbusUrl(command, agency, route, otherParams) {
  url = "http://webservices.nextbus.com/service/publicXMLFeed?";
  if (command.length > 0) {
    url = url + "&command=" + command;
  }
  if (agency.length > 0) {
    url = url + "&a=" + agency;
  }
  if (route.length > 0) {
    url = url + "&r=" + route;
  }
  if (otherParams && otherParams.length > 0) {
    url = url + otherParams;
  }
  return randomizeUrl(url);
}


// Get route information so we can color routes, get full names, etc.
function getRoutes() {
  async.each(nextbusRequests, function(nextbusRequest, callback) {
    var url = nextbusUrl("routeConfig", nextbusRequest.agency, nextbusRequest.route);
    
    downloadURL(url, function(request) {
      var responseJSON = x2js.xml_str2json(request.responseText);
      
      // x2JS might return Array or Object, ensure Array
      nextbusRequest.routes = [].concat(responseJSON.body.route);
      
      callback();
    });
  }, function(err){
      if (err) {
        // One of the iterations produced an error.
        // All processing will now stop.
        console.log('Failed to get a route: ' + err);
      } else {
        console.log('All routes downloaded and processed.');
      }
            
      // First call to getVehicles, kicks off the setTimeout loop
      getVehicles();
  });
}

function manualRefresh() {
  if (getVehiclesTimeoutId != null) {
    clearInterval(getVehiclesTimeoutId);
  }
  
  getVehicles();
}

function getVehicles() {
  async.each(nextbusRequests, function(nextbusRequest, callback) {
    var url = nextbusUrl("vehicleLocations", nextbusRequest.agency, nextbusRequest.route, "&t=0");
    
    downloadURL(url, function(request) {
      var responseJSON = x2js.xml_str2json(request.responseText);

      // x2JS might return Array or Object, ensure Array
      if ("vehicle" in responseJSON.body) {
        nextbusRequest.vehicles = [].concat(responseJSON.body.vehicle);
      } else {
        nextbusRequest.vehicles = [];
      }
      
      callback();
    });
    
  }, function(err){
      if (err) {
        // One of the iterations produced an error.
        // All processing will now stop.
        console.log('Failed to get vehicle locations for a route: ' + err);
      } else {
        console.log('Vehicle locations for all routes downloaded and processed.');
      }
      
      // Process to GeoJSON and display on map
      var geoJSONAll = constructGeoJSONAll();
      featureLayer.setGeoJSON(geoJSONAll);
      rotateMarkers();
      
      // additional display adjustments
      if (!firstFit && fitOnParse) {
        map.fitBounds(featureLayer.getBounds());  
        firstFit = true;
      }

      // reset refresh button visual to indicate done
      refreshButton.innerHTML = '';
      
      // run it again after some time
      getVehiclesTimeoutId = window.setTimeout(function() {
        getVehicles();
      }, refreshTimeout);
  });
}


function downloadURL(url, callback) {
  var request = new XMLHttpRequest();
  request.onreadystatechange = function() {
    if (request.readyState === 4) {
      callback(request);
    }
  };

  console.log("XMLHttpRequest GET " + url);
  request.open("GET", url, true);
  request.send();
}

function start() {
  trackerStart();
  refreshButton = document.getElementById("refresh-button");
  refreshButton.onclick = function() {
    refreshButton.innerHTML = '...';
    manualRefresh();
    return false;
  }
}

function trackerStart() {
  map = L.mapbox.map('map', 'jasongao.l8n90e91')
    .setView([42.362, -71.101], 13);

  featureLayer = L.mapbox.featureLayer().addTo(map);

  getRoutes();
}



// MIT-licensed code by Benjamin Becquet
// https://github.com/bbecquet/Leaflet.PolylineDecorator
L.RotatedMarker = L.Marker.extend({
  options: { angle: 0 },
  _setPos: function(pos) {
    L.Marker.prototype._setPos.call(this, pos);
    if (L.DomUtil.TRANSFORM) {
      // use the CSS transform rule if available
      this._icon.style[L.DomUtil.TRANSFORM] += ' rotate(' + this.options.angle + 'deg)';
    } else if (L.Browser.ie) {
      // fallback for IE6, IE7, IE8
      var rad = this.options.angle * L.LatLng.DEG_TO_RAD,
      costheta = Math.cos(rad),
      sintheta = Math.sin(rad);
      this._icon.style.filter += ' progid:DXImageTransform.Microsoft.Matrix(sizingMethod=\'auto expand\', M11=' +
        costheta + ', M12=' + (-sintheta) + ', M21=' + sintheta + ', M22=' + costheta + ')';
    }
  }
});
L.rotatedMarker = function(pos, options) {
    return new L.RotatedMarker(pos, options);
};
