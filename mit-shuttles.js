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

showStops = false;


routesDrawn = [];

function constructGeoJSONAll() {
  geoJSON = {};
  geoJSON.type = "FeatureCollection";
  geoJSON.features = [];
  
  routesDrawn = [];
  
  nextbusRequests.forEach(function(nextbusRequest){
    var features = vehiclesToGeoJSONFeatures(nextbusRequest);
    geoJSON.features = geoJSON.features.concat(features);
  });
  
  return geoJSON;
}

function vehiclesToGeoJSONFeatures(nextbusRequest) {
  var vehicles = nextbusRequest.vehicles;
  var geoJSON = [];

  console.log("Parsing and drawing " + vehicles.length + " vehicles on " + nextbusRequest.agency + " - " + nextbusRequest.route);
  for (var i = 0; i < vehicles.length; i++) {  
    var v = vehicles[i];

    // Find which route this vehicle is on
    var r = findRoute(nextbusRequest.agency, v._routeTag);
    if (r === null) {
      console.log("Couldn't find matching route for vehicle routeTag " + v._routeTag);
      v._title = v._routeTag;
      v._color = "0000ff";
    } else {
      // Add this vehicle's route line segments and stop markers if not already drawn
      if (routesDrawn.indexOf(r) < 0) {
        geoJSON = geoJSON.concat(getPathFeaturesFromRoute(r));
        if (showStops) {
          geoJSON = geoJSON.concat(getStopFeaturesFromRoute(r));
        }
        routesDrawn.push(r);
      } 
      

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
        "marker-size": "large",
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
    p.properties["title"] = s._title;
    p.properties["marker-color"] = "#" + r._color;
    p.properties["marker-size"] = "small";
    p.properties["marker-symbol"] = "circle";
    //p.properties.icon = {};
    //p.properties.icon.iconUrl = "/mapbox.js/assets/images/astronaut1.png";
    //p.properties.icon.iconSize = [50, 50]; // size of the icon
    //p.properties.icon.iconAnchor = [25, 25]; // point of the icon which will correspond to marker's location
    //p.properties.icon.popupAnchor = [0, -25]; // point from which the popup should open relative to the iconAnchor
    //p.properties.icon.className = "dot";

    p.geometry = {};
    p.geometry.type = "Point";
    p.geometry.coordinates = [s._lon, s._lat];

    features.push(p);
  }

  return features;
}


function getPathFeaturesFromRoute(r) {
  console.log("Parsing and drawing route " + r._tag);
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
      if ((nextbusRequest.route === "" || nextbusRequest.route === tag) && typeof(nextbusRequest.returnedRoutes) !== 'undefined') {
        routes = nextbusRequest.returnedRoutes;
      }
    }
  });
  
  // routes.length might be 0 if routes were not returned by nextbus
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
      
      if (typeof(responseJSON.body.Error) !== 'undefined') {
        //console.log("Error in NextBus API response: ");
        //console.log(responseJSON.body);
        callback(responseJSON.body.Error);
        return;
      }
      
      // x2JS might return Array or Object, ensure Array
      nextbusRequest.returnedRoutes = [].concat(responseJSON.body.route);
      //console.log(responseJSON.body);
      
      callback();
    });
  }, function(err){
      if (err) {
        // One of the iterations produced an error.
        // All processing will now stop.
        console.log('Failed to get a route: ' + err);
        return;
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
      
      if (typeof(responseJSON.body.Error) !== 'undefined') {
        //console.log("Error in NextBus API response: ");
        //console.log(responseJSON.body);
        callback(responseJSON.body.Error);
        return;
      }

      // x2JS might return Array or Object, ensure Array
      if ("vehicle" in responseJSON.body) {
        nextbusRequest.vehicles = [].concat(responseJSON.body.vehicle);
      } else {
        nextbusRequest.vehicles = [];
      }
      
      callback();
    });
    
  }, function(err){
      // reset refresh button visual to indicate done
      refreshButton.innerHTML = '';
    
      if (err) {
        // One of the iterations produced an error.
        // All processing will now stop.
        console.log('Failed to get vehicle locations for a route: ' + err);
        return;
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

function initialize() {
  // If GET paramters present, use them to customize nextbus API requests
  var qd = {};
  location.search.substr(1).split("&").forEach(function(item) {var s = item.split("="), k = s[0], v = s[1] && decodeURIComponent(s[1]); (k in qd) ? qd[k].push(v) : qd[k] = [v]});
  console.log("GET parameters: ");
  console.log(qd);
  
  // special key for showing the stops on routes
  if (typeof(qd.showStops) !== 'undefined') {
    showStops = true; // force true regardless of global setting
    delete qd.showStops;
  }
  
  // check both length and non-presence of empty string GET param key
  if (Object.keys(qd).length > 0 && typeof(qd[""]) === 'undefined') {
    nextbusRequests = [];
    
    for (agency in qd) {
        routes = qd[agency];
        for (i = 0; i < routes.length; i++) {
          nextbusRequests.push(
            {
              "agency": agency,
              "route": routes[i]
            }
          );
        }
      
    }
    
  }
  
  
  
  map = L.mapbox.map('map', 'jasongao.l8n90e91')
    .setView([42.362, -71.101], 13);
  
  featureLayer = L.mapbox.featureLayer().addTo(map);
  // TODO use separate featureLayer for routes, stops, and vehicles
  
  // Set a custom icon on each marker based on feature properties.
  //featureLayer.on('layeradd', function(e) {
  //    var marker = e.layer,
  //        feature = marker.feature;
  //
  //    marker.setIcon(L.icon(feature.properties.icon));
  //});
  
  // Setup refresh button action
  refreshButton = document.getElementById("refresh-button");
  refreshButton.onclick = function() {
    refreshButton.innerHTML = '...';
    manualRefresh();
    return false;
  }
  
  // Initial API request
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
