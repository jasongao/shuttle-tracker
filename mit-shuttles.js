refreshTimeout = 10000;
x2js = new X2JS();
L.mapbox.accessToken = 'pk.eyJ1IjoiamFzb25nYW8iLCJhIjoiWEFEbnplWSJ9.z_4HeYl01RN0tYSK6DxpbQ';
nextbusAgency = "mit";
nextbusRoute = "";
routes = [];

function toGeoJSON(responseText) {
  var responseJSON = x2js.xml_str2json(responseText);
  var geoJSON = [];
  var vehicles = [];

  // "vehicles" might be a single Object or an Array; ensure it's an Array
  vehicles = vehicles.concat(responseJSON.body.vehicle);

  for (var i = 0; i < vehicles.length; i++) {
    console.log("Parsing " + vehicles.length + " vehicles...");
    var v = vehicles[i];
    
    // Find which route this vehicle is on
    var r = findRoute(v._routeTag);
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
    var v_out = {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [v._lon, v._lat]
      },
      "properties": {
        "title": v._title,
        "description": v._secsSinceReport + " sec ago, " + v._speedKmHr + " km/h, heading " + v._heading,
        "marker-color": v._color,
        "marker-size": "large",
        "marker-symbol": "bus"
      }
    };

    geoJSON.push(v_out);
  }
  
  // console.log(geoJSON);
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
      ls.geometry.coordinates.push([p._lon,p._lat]);
    }
    
    //console.log(ls);    
    features.push(ls);
  }
  
  return features;
}


function getVehicles() {
  var url = nextbusUrl("vehicleLocations", nextbusAgency, nextbusRoute, "&t=0");
  var request = new XMLHttpRequest();

  request.onreadystatechange = function() {
    if (request.readyState === 4) {
      // convert to GeoJSON and update feature layer
      var geoJSON = toGeoJSON(request.responseText);
      featureLayer.setGeoJSON(geoJSON);
      
      // additional display adjustments
      // map.fitBounds(featureLayer.getBounds());
      //rotateMarkers();

      // run it again after some time
      window.setTimeout(function() {
        getVehicles();
      }, refreshTimeout);
    }
  };

  console.log("XMLHttpRequest GET " + url);
  request.open("GET", url, true);
  request.send();
}


function rotateMarkers() {
  featureLayer.eachLayer(function(marker) {
    if (L.DomUtil.TRANSFORM) {
      // use the CSS transform rule if available
      marker._icon.style[L.DomUtil.TRANSFORM] += ' rotate(' + 180 + 'deg)';
    } else if (L.Browser.ie) {
      // fallback for IE6, IE7, IE8
      var rad = this.options.angle * L.LatLng.DEG_TO_RAD,
        costheta = Math.cos(rad),
        sintheta = Math.sin(rad);
      marker._icon.style.filter += ' progid:DXImageTransform.Microsoft.Matrix(sizingMethod=\'auto expand\', M11=' +
        costheta + ', M12=' + (-sintheta) + ', M21=' + sintheta + ', M22=' + costheta + ')';
    }
  });
}


function findRoute(tag) {
  if (typeof routes === 'undefined') {
    return null;
  }
  for (var i = 0; i < routes.length; i++) {
    if (routes[i]._tag === tag ) {
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
  var url = nextbusUrl("routeConfig", nextbusAgency, nextbusRoute);
  var request = new XMLHttpRequest();
  
  request.onreadystatechange = function() {
    if (request.readyState === 4) {
      var responseJSON = x2js.xml_str2json(request.responseText);
      
      // keep around globally
      // like with vehicles, x2JS might make it Array or Object, ensure Array
      routes = routes.concat(responseJSON.body.route);
      
      getVehicles();
    }
  };

  console.log("XMLHttpRequest GET " + url);
  request.open("GET", url, true);
  request.send();
}


function trackerStart() {
  map = L.mapbox.map('map', 'jasongao.l8n90e91')
    .setView([42.36, -71.095], 14);

  featureLayer = L.mapbox.featureLayer().addTo(map);

  getRoutes();
}