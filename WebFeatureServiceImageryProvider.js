define('Scene/WebFeatureServiceImageryProvider',[
        '../Core/Math',
        '../Core/Color',
        '../Core/PinBuilder',
        '../Core/Cartographic', 
        '../Core/Cartesian3',
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/defineProperties',
        '../Core/loadXML',
        '../Core/loadText',
        '../Core/DeveloperError',
        '../Core/Ellipsoid',
        '../Core/Event',
        '../ThirdParty/when',
        './PolylineCollection',
        './BillboardCollection'
    ],function(
        Math,
        Color,
        PinBuilder,
        Cartographic,
        Cartesian3,
        defaultValue,
        defined,
        defineProperties,
        loadXML,
        loadText,
        DeveloperError,
        Ellipsoid,
        Event,
        when,
        PolylineCollection,
        BillboardCollection){
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
            Point : processPoint,
            MultiPoint : processMultiPoint,
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

            var featureText = feature.attributes[0].textContent.split(".");
            var featureID = parseInt(featureText[1]);
            if(that._featureMap[featureID])
                return;
            else
                that._featureMap[featureID] = feature.attributes[0].textContent;


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
            that._viewer.scene.primitives.add(that._collectionVector[length - 1]); 
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

        function renderPoint(that){
            var coords = [];
            for(var i = 0 ; i < that._coords.length/2;i++){
                var lat = parseFloat(that._coords[2*i]);
                var lng = parseFloat(that._coords[2*i + 1]);
                coords.push(lat,lng);
            }

            var cart = new Cartographic();
            cart.longitude = Math.toRadians(coords[0]);
            cart.latitude = Math.toRadians(coords[1]);
            cart.height = 0;

            var billBoardPosition = Ellipsoid.WGS84.cartographicToCartesian(cart);

            that._collectionVector.push(new BillboardCollection());
            var length = that._collectionVector.length;
            var builder = new PinBuilder();
            var color = new Color(0.0,1.0,1.0);
            that._collectionVector[length - 1].add({
                image : builder.fromColor(color,16).toDataURL(),
                position : billBoardPosition
            });
            that._viewer.scene.primitives.add(that._collectionVector[length - 1]);
        }


        function processPoint(that, point, properties, crsProperties) {
            crsProperties = getCrsProperties(point, crsProperties);
            var coordString = point.firstElementChild.textContent;
            var splitCoords = coordString.split(",");
            var coords_feature = [];
            that._coords.length = 0;
            //pushing lat/long values
            for(var i = 0 ; i < splitCoords.length; i++){
                that._coords.push(splitCoords[0],splitCoords[1]);
            }
            renderPoint(that);
        }

        function processMultiPoint(that, multiPoint, properties, crsProperties) {
            crsProperties = getCrsProperties(multiPoint, crsProperties);
            var pointMembers = multiPoint.getElementsByTagNameNS(gmlns, "pointMember");
            if(pointMembers.length == 0) {
                pointMembers = multiPoint.getElementsByTagNameNS(gmlns, "pointMembers");
            }
    
                for(var i = 0; i < pointMembers.length; i++) {
                    var points = pointMembers[i].children;
                    for(var j = 0; j < points.length; j++) {
                        processPoint(that, points[j], properties, crsProperties);
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
                
            var width = that._viewer.scene.canvas.width;
            var height = that._viewer.scene.canvas.height;

            var sw = new Cesium.Cartesian2(0,height);
    
            var left = that._viewer.scene.camera.pickEllipsoid(sw,Ellipsoid.WGS84);
            if(!left){
                that._validBoundingBox = false;
                return;
            }

            var ne = new Cesium.Cartesian2(width,0);
            var right = that._viewer.scene.camera.pickEllipsoid(ne,Ellipsoid.WGS84);
             if(!right){
                that._validBoundingBox = false;
                return;
            }

            var elps = Ellipsoid.WGS84;

            var SW = elps.cartesianToCartographic(left);
            var NE = elps.cartesianToCartographic(right);

            that.S_W.lng = Cesium.Math.toDegrees(SW.longitude);
            that.S_W.lat = Cesium.Math.toDegrees(SW.latitude);

            that.N_E.lng = Cesium.Math.toDegrees(NE.longitude);
            that.N_E.lat = Cesium.Math.toDegrees(NE.latitude);

            that._validBoundingBox = true;

        }  


        var WebFeatureServiceImageryProvider = function(options){

            if(!defined(options.url))
                throw DeveloperError('options.url is required');

            if(!defined(options.layers))
                throw DeveloperError('options.layers is required');

            if(!defined(options.viewer))
                throw DeveloperError("viewer is required");
            
            //cesium viewer widget
            this._viewer = options.viewer;

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
            this._maxFeatures = defaultValue(options.maxFeatures,100);

            //use bounding box
            this._bboxRequired = defaultValue(options.BBOX,true);

            //found valid bounding box
            this._validBoundingBox = false;

            //bbox south west and north east corners
            this.S_W = {};
            this.N_E = {};

            //feature map of features alrready rendered
            this._featureMap = [];

            this.buildCompleteRequestUrl();

            this.initialize();

        };

        //var xhr = new XMLHttpRequest();
        var scratchLastCamera;
        var scratchCamera;

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
        *   Start requesting and rendering features
        *   in the current rendering volume
        */
        //change equals test to equalsEpsilon to avoid multiple updates for small changes
        WebFeatureServiceImageryProvider.prototype.initialize = function(){
            if(!scratchCamera)
                scratchCamera = this._viewer.scene.camera;
            if(!scratchLastCamera)
                scratchLastCamera = scratchCamera.clone();
            var that = this;
            this._viewer.clock.onTick.addEventListener(function() {
                if (!scratchCamera.position.equals(scratchLastCamera.position) ||
                    !scratchCamera.direction.equals(scratchLastCamera.direction) ||
                    !scratchCamera.up.equals(scratchLastCamera.up) ||
                    !scratchCamera.right.equals(scratchLastCamera.right) ||
                    !scratchCamera.transform.equals(scratchLastCamera.transform) ||
                    !scratchCamera.frustum.equals(scratchLastCamera.frustum)) {
                    that.GetFeature();
                    scratchLastCamera = scratchCamera.clone();
                }
            });
        }

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
        *   Default function to get the entire 
        *   feature collection in one request
        */
        WebFeatureServiceImageryProvider.prototype.GetFeature = function(){
            if(this._bboxRequired)
                compute(this);
            var that = this;
            var request = "request=GetFeature&" + "typeName=" + this._layers;
            request = this._getUrl + request + "&maxFeatures=" + this._maxFeatures;
            if(this._bboxRequired && this._validBoundingBox){
                var bbox = "&bbox=" + this.S_W.lng.toString() + "," + this.S_W.lat.toString() + ",";
                bbox = bbox + this.N_E.lng.toString() + "," + this.N_E.lat.toString();
                request = request + bbox;
            }
            when(loadText(request),function(response){
                that._response = response;
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
                loadGML(that,that._response);
            });
        };

        return WebFeatureServiceImageryProvider;


    });
