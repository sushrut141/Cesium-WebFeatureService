define('Scene/WebFeatureServiceImageryProvider',[ 
        '../Core/Cartesian3',
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/defineProperties',
        '../Core/loadXML',
        '../Core/loadText',
        '../Core/DeveloperError',
        '../Core/Event',
        '../ThirdParty/when',
        './PolylineCollection',
    ],function(

        Cartesian3,
        defaultValue,
        defined,
        defineProperties,
        loadXML,
        loadText,
        DeveloperError,
        Event,
        when,
        PolylineCollection){
        "use strict";


        function defaultCrsFunction(coordinates) {
            return Cartesian3.fromDegrees(coordinates[0], coordinates[1], coordinates[2]);
        }

        var crsNames = {
            'EPSG:4326' : defaultCrsFunction,
            'urn:ogc:def:crs:EPSG::4326' : defaultCrsFunction,
            'urn:ogc:def:crs:EPSG:6.6:4326' : defaultCrsFunction,
            'http://www.opengis.net/gml/srs/epsg.xml#4326' : defaultCrsFunction
        };

        var sizes = {
            small : 24,
            medium : 48,
            large : 64
        };

         var geometryPropertyTypes = {
            LineString : processLineString,
            MultiLineString : processMultiLineString
        };

        var gmlns = "http://www.opengis.net/gml";

        function getCrsProperties(node, crsProperties) {
            var crsName = node.getAttribute('srsName');
            if(crsName) {
                var crsFunction = crsNames[crsName];
                if(!crsFunction) {
                    return RuntimeError('Unknown crs name: ' + crsName);
                }
                crsProperties.crsFunction = crsFunction;
            }
    
                var crsDimension = node.getAttribute('srsDimension');
                if(crsDimension) {
                    crsDimension = parseInt(crsDimension);
                    crsProperties.crsDimension = crsDimension;
                }
            return crsProperties;
        }


        function processFeatureCollection(that,gml) {

            var documentNode = gml.documentElement;
            var featureCollection = documentNode.getElementsByTagNameNS(gmlns, "featureMember");
            if(featureCollection.length == 0) {
                featureCollection = documentNode.getElementsByTagNameNS(gmlns, "featureMembers");
            }
        
            var crsProperties = {'crsFunction' : defaultCrsFunction, 'crsDimension' : 2};
             var boundedByNode = documentNode.getElementsByTagNameNS(gmlns, "boundedBy")[0];
            if(boundedByNode) {
                crsProperties = getCrsProperties(boundedByNode.firstElementChild, crsProperties);
            }

            for(var i = 0; i < featureCollection.length; i++) {
                 var features = featureCollection[i].children;
                 for(var j = 0; j < features.length; j++) {
                    processFeature(that,features[j], crsProperties);
                }
            }
        }


        function processFeature(that,feature, crsProperties) {
            var i, j, geometryHandler, geometryElements = [];
            var crsFunction = defaultCrsFunction;
            var properties = {};
    
                var boundedByNode = feature.getElementsByTagNameNS(gmlns, "boundedBy")[0];
                if(boundedByNode) {
                    crsProperties = getCrsProperties(feature.firstElementChild, crsProperties);
                    feature.removeChild(boundedByNode);
                }
    
                var elements = feature.children;
                for(i = 0; i < elements.length; i++) {
                    var childCount = elements[i].childElementCount;
                    if(childCount == 0) {
                        //Non-nested non-spatial properties.
                        properties[elements[i].localName] = elements[i].textContent;
                    } else if(childCount > 0) {
                        //Nested and geometry properties.
                        var subElements = elements[i].children;
                        var prop = {};
                        for(j = 0; j < childCount; j++) {
                            if(subElements[j].namespaceURI === gmlns) {
                                geometryElements.push(subElements[j]);
                            } else {
                                prop[subElements[j].localName] = subElements[j].textContent;
                            }
                        }
                        if(Object.keys(prop).length) {
                            properties[elements[i].localName] = prop;
                        }
                    }
                }
                for(i = 0; i < geometryElements.length; i++) {
                    geometryHandler = geometryPropertyTypes[geometryElements[i].localName];
                    geometryHandler(that,geometryElements[i], properties, crsProperties);
                }
        }

        function renderLineStringAsPolyline(that){
            var coords = [];
            for(var i = 0 ; i < that._coords.length/2;i++){
                var lat = parseFloat(that._coords[2*i]);
                var lng = parseFloat(that._coords[2*i + 1]);
                coords.push(lat,lng);
            }

            that._collectionVector.push(new PolylineCollection());
            var length = that._collectionVector.length;
            that._collectionVector[length - 1].add({
                positions : Cartesian3.fromDegreesArray(coords.slice(0)),
                width : 2.0,
                material: Cesium.Material.fromType('Color', {
                    color: new Cesium.Color(1,0.8,0.2)
                }),
                show : true
            });
            that._scene.primitives.add(that._collectionVector[length - 1]); 
        }

        function processLineString(that,lineString, properties, crsProperties, index) {
            crsProperties = getCrsProperties(lineString, crsProperties);
            var coordString = lineString.firstElementChild.textContent;
            var splitCoords = coordString.split(" ");
            var coords_feature = [];
            that._coords.length = 0;
            //pushing lat/long values
            for(var i = 0 ; i < splitCoords.length; i++){
                var split = splitCoords[i].split(",");
                that._coords.push(split[0],split[1]);
            }
            /*that._coords.push({
                contour : index,
                positions : coords_feature.slice(0)
            });*/
            renderLineStringAsPolyline(that);
        

            //console.log(coordString);
            //var coordinates = processCoordinates(coordString, crsProperties);
            //createPolyline(coordinates, true, properties, crsProperties);
        }

        function processMultiLineString(that,multiLineString, properties, crsProperties) {
            crsProperties = getCrsProperties(multiLineString, crsProperties);
            var lineStringMembers = multiLineString.getElementsByTagNameNS(gmlns, "lineStringMember");
            if(lineStringMembers.length == 0) {
                lineStringMembers = multiLineString.getElementsByTagNameNS(gmlns, "lineStringMembers");
            }

            for(var i = 0; i < lineStringMembers.length; i++) {
                var lineStrings = lineStringMembers[i].children;
                for(var j = 0; j < lineStrings.length; j++) {
                    processLineString(that,lineStrings[j], properties, crsProperties, j);
                }
            }
        }
        /*
        *   options = {
                url : "http://localhost:8080/geoserver/",
                layers : "namespace:layerName",
                featureID : feature id(depthContour.3438)(optional)
            };
        */

        function compute(that){

            var sw = new Cesium.Cartesian2(0,height);
    
            var left = viewer.scene.camera.pickEllipsoid(sw,Cesium.Ellipsoid.WGS84);
    
            var ne = new Cesium.Cartesian2(width,0);

            var right = viewer.scene.camera.pickEllipsoid(ne,Cesium.Ellipsoid.WGS84);

            var elps = Cesium.Ellipsoid.WGS84;

            var SW = elps.cartesianToCartographic(left);
            var NE = elps.cartesianToCartographic(right);

            that.S_W.lng = Cesium.Math.toDegrees(SW.longitude);
            that.S_W.lat = Cesium.Math.toDegrees(SW.latitude);

            that.N_E.lng = Cesium.Math.toDegrees(NE.longitude);
            that.N_E.lat = Cesium.Math.toDegrees(NE.latitude);
    
            //console.log(S_W);
            //console.log(N_E);
        }  


        var WebFeatureServiceImageryProvider = function(options){

            if(!defined(options.url))
                throw DeveloperError('options.url is required');

            if(!defined(options.layers))
                throw DeveloperError('options.layers is required');

            if(!defined(options.scene))
                throw DeveloperError("Scene is required");
            else
                this._scene = options.scene;

            //address of server
            this._url = options.url;

            //name of the layer published in server
            this._layers = options.layers; 

            //complete url generated using _url and layer name
            this._getUrl = undefined;

            //response received from server
            this._response = undefined;

            //vector of coords obtained by parsing GML object
            this._coords = [];

            //vector of PolylineCollections 
            //used to render linestrings
            this._collectionVector = [];

            //max number of features to request
            this._maxFeatures = 300;

            //bbox
            this.S_W = {};
            this.N_E = {};

            this.buildCompleteRequestUrl();
        };

        //var xhr = new XMLHttpRequest();

        defineProperties(WebFeatureServiceImageryProvider.prototype,{

            url : {
                get : function(){
                    return this._url;
                }
            },

            layers : {
                get : function(){
                    return this._layers;
                }
            },

            ready : {
                get : function(){
                    return this._ready;
                }
            },

            url : {
                get : function(){
                    return this._getUrl;
                }
            },

            
            featureCount : {
                get : function(){
                    return this._coords.length;
                }
            },

            maxFeatures : {
                get : function(){
                    return this._maxFeatures;
                },

                set : function(featureLimit){
                    this._maxFeatures = featureLimit;
                }
            }
        });

        /*
        *   sends a GET request to the server and 
        *   waits for a response
        *   returns undefined if response is null
        */
        //this won't work....use promises
        function getResponseFromServer(that,request){
            xhr.onreadystatechange = function(){
                if (xhr.readyState == XMLHttpRequest.DONE) {
                    if(xhr.responseText=="")
                        return undefined;
                    else{
                        //alert(xhr.responseText);
                        that._response = xhr.responseText;
                        loadGML(that, that._response);
                        //console.log(that._response);
                    }
                }
            }
            xhr.open('GET',request);
            xhr.send(null);
        }


        function loadGML(that, responseText){
            var rsp = responseText;
            var parser = new DOMParser();
            var gml = parser.parseFromString(rsp,'application/xml');
            processFeatureCollection(that, gml);
        }


        /*
        *   Example Geoserver GET request url
        *   http://localhost:8080/geoserver/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=tiger:tiger_roads&maxFeatures=50
        */
        WebFeatureServiceImageryProvider.prototype.buildCompleteRequestUrl = function(){
            var typeNameInfo = this._layers.split(":");
            var request_url = this._url + "/" + "wfs?";
            var params = "service=WFS&version=1.0.0&";
            this._getUrl = request_url + params;
        };

        /*
        *   operations to be supported by WFS spec
        *   logs a string having the XML spec in the console. 
        */
        WebFeatureServiceImageryProvider.prototype.GetCapabilities = function(){
            var request = "request=GetCapabilities";
            request = this._getUrl + request;
            when(loadText(request),function(response){
               console.log(response);
            });
        };

        /*
        *   returns  the feature type form
        *   contains only feature types not actual 
        *   values and coordinates
        */
        WebFeatureServiceImageryProvider.prototype.DescribeFeatureType = function(){
            var request = "request=DescribeFeatureType&" +  "typeName=" + this._layers;
            request = this._getUrl + request;
            when(loadText(request),function(response){
                console.log(response);
            });
        };

        /*
        *   Default function to get the 
        *   feature collection visible in the current viewing
        *   volume limited by maxFeatures
        */
        WebFeatureServiceImageryProvider.prototype.GetFeature = function(){
            compute(this);
            var request = "request=GetFeature&" + "typeName=" + this._layers;
            request = this._getUrl + request + "&maxFeatures=" + this._maxFeatures;
            var bbox = "&bbox=" + this.S_W.lng.toString() + "," + this.S_W.lat.toString() + ",";
            bbox = bbox + this.N_E.lng.toString() + "," + this.N_E.lat.toString();
            var that = this;
            request = request + bbox;
            //return getResponseFromServer(this, request);
            when(loadText(request),function(response){
                that._response = response;
                console.log(that._response);
                loadGML(that,that._response);
            });    
        };

        /*
        *   Function to get specific features
        *   Specify a list of features to be queried
        *   Ex. features = ["contour.1","contour.2","contour.3"...]
        */
        WebFeatureServiceImageryProvider.prototype.GetSpecificFeatures = function(featureList){

            var f_list;
            var f_length = featureList.length;
            if(f_length === 1){
                var request = "request=GetFeature&" + "typeName=" + this._layers
                                + "&" + "featureID=" + featureList[0];
                request = this._getUrl + request;
                return getResponseFromServer(request);          
            }else{
                f_list = featureList[0];
                for(var i = 1 ;i < f_length; i++){
                    f_list = f_list + "," + featureList[i];
                }
                var request = "request=GetFeature&" + "typeName=" + this._layers
                                + "&" + "featureID=" + f_list;
                request = this._getUrl + request;
                return getResponseFromServer(this, request);
            }
        };

        /*
        *   Get Feature with ID
        */
        WebFeatureServiceImageryProvider.prototype.GetFeatureWithId = function(id){
            var request = "request=GetFeature&" + "featureID=" + id;
            request = this._getUrl + request;
            //getResponseFromServer(this,request);
            var that = this;
           when(loadText(request),function(response){
                that._response = response;
                console.log(that._response);
                loadGML(that,that._response);
            });
        };

        return WebFeatureServiceImageryProvider;


    });