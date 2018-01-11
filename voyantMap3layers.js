// Utility function to get layer by id
if (ol.Map.prototype.getLayer === undefined) {
    ol.Map.prototype.getLayer = function (id) {
        let layer = undefined;
        this.getLayers().forEach((lyr) => {
            if (id === lyr.get('id')) {
                layer = lyr;
            }
        });
        return layer;
    }
}

// Speed of vectors drawing
let pointsPerMs = 0.3;

const pointsPerArc = 500;
// Time between vectors drawing
let delayBetweenVectors = pointsPerArc / pointsPerMs;

// Used to keep track of number of filters
let filterCount = 0;

let timedEvents = [[]];

let cities = {};

// Colors of the different filters
const colors = [
    "rgb(230, 25, 75)",
    "rgb(0,92,49)",
    "rgb(145, 30, 180)",
    "rgb(128, 0, 0)",
    "rgb(0, 0, 128)",
    "rgb(60, 180, 75)",
    "rgb(143,124,0)",
    "rgb(157,204,0)",
];

// Elements that make up the popup
const container = document.getElementById('popup');
const content = document.getElementById('popup-content');
const closer = document.getElementById('popup-closer');

// Create an overlay to anchor the popup to the map.
const overlay = new ol.Overlay({
    element: container,
    autoPan: true,
    autoPanAnimation: {
        duration: 250
    }
});

// Add a click handler to hide the popup
closer.onclick = () => {
    overlay.setPosition(undefined);
    closer.blur();
    return false;
};

const map = new ol.Map({
    layers: [
        new ol.layer.Tile({
            preload: Infinity,
            source: new ol.source.Stamen({
                //cacheSize: 2048,
                layer: 'watercolor'
            })
        }),

        new ol.layer.Tile({
            preload: Infinity,
            source: new ol.source.Stamen({
                //cacheize: 2048,
                layer: 'toner-hybrid'
            })
        }),
        /*
        // National Geographic Map, more realistic, but includes labels and loading is slower
        new ol.layer.Tile({
            preload: Infinity,
            source: new ol.source.TileArcGISRest({
                url: "https://services.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer"
            }),
        })
        */
    ],
    target: 'map',
    loadTilesWhileInteracting: true,
    overlays: [overlay],
    view: new ol.View({
        center: [1500000, 6000000],
        zoom: 2
    })
});

// Add a click handler to the map to render the popup.
map.on('singleclick', (event) => {
    const pixel = event.pixel;
    const features = map.getFeaturesAtPixel(pixel);
    if(features) {
        let infos = "<ul>";
        let i = 0;
        while(features[i].getGeometry().getType() !== "Circle" || features[i].get("selected")){
            i++;
        }
        const feature = features[i];
        const featureInfos = feature.get("infos");
        featureInfos.forEach(info => {
            infos += `<li>${info.author}, <a href=${info.url} target='_blank'>${info.title}</a>, ${info.year}</li>`;
        });
        const header = feature.get("text");
        infos += "</ul>";
        const coordinate = event.coordinate;
        content.innerHTML = `<h3>${header}</h3>${infos}`;
        overlay.setPosition(coordinate);
    }
});

// Change animation speed when slider is moved
const slider = document.getElementById("animationSpeed");
slider.value = pointsPerMs * 40;

slider.oninput = () => {
    pointsPerMs = slider.value / 40.0;
    delayBetweenVectors = pointsPerArc / pointsPerMs;
};

// Style for vector after animation
const travelStyleFunction = (feature, resolution) => {
    // default color is red, selected feature is blue and first 8 layers have pre-defined colors
    let color = "rgb(255, 0, 0)";
    if (feature.get("selected")) {
        color = "rgb(0, 0, 255)";
    } else if (feature.get("color")) {
        color = feature.get("color");
    }

    const stroke = new ol.style.Stroke({
        color: color,
        width: 3
    });

    const styles = [
        new ol.style.Style({
            stroke: stroke
        })];

    // Add arrow at the end of vectors
    const geometry = feature.getGeometry();
    const end = geometry.getLastCoordinate();
    const beforeEnd = geometry.getCoordinateAt(0.9);
    const dx = end[0] - beforeEnd[0];
    const dy = end[1] - beforeEnd[1];
    const rotation = Math.atan2(dy, dx);

    const lineStr1 = new ol.geom.LineString([end, [end[0] - 10 * resolution, end[1] + 10 * resolution]]);
    lineStr1.rotate(rotation, end);
    const lineStr2 = new ol.geom.LineString([end, [end[0] - 10 * resolution, end[1] - 10 * resolution]]);
    lineStr2.rotate(rotation, end);

    styles.push(new ol.style.Style({
        geometry: lineStr1,
        stroke: stroke
    }));
    styles.push(new ol.style.Style({
        geometry: lineStr2,
        stroke: stroke
    }));

    return styles;
};

// Style for cities
const cityStyleFunction = (feature) => {
    // default color is red, selected feature is blue and first 8 layers have pre-defined colors
    let color = "rgba(255, 0, 0, 0.5)";
    if (feature.get("selected")) {
        color = "rgb(0, 0, 255)";
    } else if (feature.get("color")) {
        color = feature.get("color");
    }
    const width = 5 + feature.get("occurences") * 5;

    const stroke = new ol.style.Stroke({
        color: color,
        width: width,
    });

    return new ol.style.Style({
            stroke: stroke
            });
};

// Style for vector during animation
const vectorStyleFunction = (feature) => {
    const color = feature.get("color");
    return (new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: color,
            width: 6
        })
    }));
};

// Add feature to animation layer with a delay
const addLater = (feature, timeout, filterId) => {
    const timedEvent = window.setTimeout(() => {
        feature.set('start', new Date().getTime());
        const layer = map.getLayer("animation" + filterId);
        const source = layer.getSource();
        source.addFeature(feature);
    }, timeout);
    timedEvents[filterId].push(timedEvent);
};

// Add feature to filter layer
const addNow = (feature, filterId) => {
    const layer = map.getLayer("layer" + filterId);
    const source = layer.getSource();
    source.addFeature(feature);
};

// Add feature to layer with a delay
const addCity = (feature, timeout, filterId) => {
    const timedEvent = window.setTimeout(() => {
        feature.set('start', new Date().getTime());
        const layer = map.getLayer("cities" + filterId);
        const source = layer.getSource();
        source.addFeature(feature);
    }, timeout);
    timedEvents[filterId].push(timedEvent);
};

// Animate travels for a layer
const animateTravels = (event, filterId) => {
    const vectorContext = event.vectorContext;
    const frameState = event.frameState;
    const layer = map.getLayer("animation" + filterId);
    const features = layer.getSource().getFeatures();
    features.forEach( (feature) => {
        if (!feature.get('finished')) {
            if(feature.getGeometry().getType() === "Circle"){
                feature.set('finished', true);
            } else {
                // only draw the lines for which the animation has not finished yet
                const coords = feature.getGeometry().getCoordinates();
                const elapsedTime = frameState.time - feature.get('start');
                const elapsedPoints = elapsedTime * pointsPerMs;

                if (elapsedPoints >= coords.length) {
                    feature.set('finished', true);
                }

                const maxIndex = Math.min(elapsedPoints, coords.length);
                const currentLine = new ol.geom.LineString(coords.slice(0, maxIndex));
                vectorContext.setStyle(vectorStyleFunction(feature));
                // directly draw the line with the vector context
                vectorContext.drawGeometry(currentLine);
            }

        }
    } );
    // tell OpenLayers to continue the animation
    map.render();
};

// Layer for selected vector
const selectedLayer = new ol.layer.Vector({
    map: map,
    source: new ol.source.Vector({
        wrapX: false,
        useSpatialIndex: false // optional, might improve performance
    }),
    zIndex: 10,
    selected: true,
    style: (feature) => {
    if(feature.getGeometry().getType() === "Circle")
        {
            return cityStyleFunction(feature, map.getView().getResolution());
        } else {
            return travelStyleFunction(feature, map.getView().getResolution());
        }
    },
    updateWhileAnimating: true, // optional, for instant visual feedback
    updateWhileInteracting: true // optional, for instant visual feedback
});

// Add handler to update selected vector when mouse is moved
map.on('pointermove', (event) => {
    selectedLayer.getSource().clear();
    const coordinate = event.coordinate;
    const pixel = event.pixel;
    const features = map.getFeaturesAtPixel(pixel);
    if(features) {
        let i = 0;
        while(features[i].get("selected") || features[i].getGeometry().getType() !== "Circle"){
            i++;
            if (i === features.length) break;
        }
        if (i < features.length) {
            const feature = features[i];

            const baseTextStyle = {
                font: '12px Calibri,sans-serif',
                textAlign: 'center',
                offsetY: -15,
                fill: new ol.style.Fill({
                    color: [0,0,0,1]
                }),
                stroke: new ol.style.Stroke({
                    color: [255,255,255,0.5],
                    width: 4
                })
            };

            baseTextStyle.text = feature.get("text");

            const textOverlayStyle = new ol.style.Style({
                text: new ol.style.Text(baseTextStyle),
                zIndex: 1
            });

            const selectedFeature = new ol.Feature({
                geometry: feature.getGeometry(),
                occurences: feature.get("occurences"),
                selected: true,
            });
            selectedLayer.getSource().addFeature(selectedFeature);
            const geometry = feature.getGeometry();
            const point = geometry.getClosestPoint(coordinate);
            const textFeature = new ol.Feature({
                geometry: new ol.geom.Point(point),
                selected: true,
            });
            textFeature.setStyle(textOverlayStyle);
            selectedLayer.getSource().addFeature(textFeature);
        }

    }
});


// Called when the filter or animate button is pressed. Shows all vectors instantly or animate them.
const filter = (filterId, animate) => {
    timedEvents[filterId].forEach(event => window.clearTimeout(event));
    let vectorLayer;
    if(animate) {
        vectorLayer = map.getLayer("animation" + filterId);
    } else {
        cities[filterId] = {};
        vectorLayer = map.getLayer("layer" + filterId);
    }
    vectorLayer.setVisible(true);
    document.getElementById("showHideButton"+filterId).innerText = "Hide travels";
    document.getElementById("showHideCitiesButton"+filterId).innerText = "Hide cities";
    vectorLayer.getSource().clear();
    const url = 'cities.json';
    fetch(url).then((response) => response.json()).then((json) => {
        const citiesData = json.cities;
        let i = 0;
        let previousCity = false;
        citiesData.forEach((city) => {
            const author = document.getElementById("author"+filterId).value.toLowerCase();
            const title = document.getElementById("title"+filterId).value.toLowerCase();
            const yearBegin = document.getElementById("yearBegin"+filterId).value;
            const yearEnd = document.getElementById("yearEnd"+filterId).value;
            if(city.infos[0].author.toLowerCase().includes(author) &&
                city.infos[0].title.toLowerCase().includes(title) &&
                (yearBegin === "" || city.infos[0].year >= yearBegin) &&
                (yearEnd === "" || city.infos[0].year <= yearEnd)) {
                const coordinates = [parseFloat(city.coordinates[1]), parseFloat(city.coordinates[0])];
                if(!cities[filterId][city.coordinates] && !animate) {
                    const circle = new ol.geom.Circle(coordinates);
                    circle.transform(ol.proj.get('EPSG:4326'), ol.proj.get('EPSG:3857'));
                    const color = colors[filterId];
                    const feature = new ol.Feature({
                        geometry: circle,
                        text: city.description,
                        finished: true,
                        infos: city.infos,
                        color: color,
                        occurences: 1,
                    });
                    // Add feature with delay if animate parameter is true
                    addCity(feature, 0, filterId);
                    cities[filterId][city.coordinates] = feature;
                } else if (!animate){
                    const feature = cities[filterId][city.coordinates];
                    const occurences = feature.get("occurences") + 1;
                    const infos = feature.get("infos");
                    infos.push(city.infos[0]);
                    feature.set("occurences", occurences);
                    feature.set("infos", infos);
                }
                if(previousCity) {
                    const text = `${previousCity.description}-${city.description}`;
                    // create an arc circle between the two locations
                    const arcGenerator = new arc.GreatCircle(
                        {x: previousCity.coordinates[0], y: previousCity.coordinates[1]},
                        {x: coordinates[0], y: coordinates[1]});

                    const arcLine = arcGenerator.Arc(pointsPerArc, {offset: 100});
                    arcLine.geometries.forEach(geometry => {
                        const line = new ol.geom.LineString(geometry.coords);
                        line.transform(ol.proj.get('EPSG:4326'), ol.proj.get('EPSG:3857'));
                        const color = colors[filterId];
                        const feature = new ol.Feature({
                            geometry: line,
                            text: text,
                            finished: !animate,
                            infos: city.infos,
                            color: color,
                        });
                        // Add feature with delay if animate parameter is true
                        if (animate) {
                            addLater(feature, i * delayBetweenVectors, filterId);
                            i++;
                        } else {
                            addNow(feature, filterId);
                        }
                    })
                }
                previousCity = {coordinates:coordinates, description: city.description};
            }
        });
        if (animate) {
            map.on('postcompose', (event) => animateTravels(event, filterId));
        }
    });
    document.getElementById("showHideButton"+filterId).disabled = false;
    document.getElementById("showHideCitiesButton"+filterId).disabled = false;

};

// Clear filter fields and layer
const clearFilter = (filterId) => {
    cities[filterId] = {};
    timedEvents[filterId].forEach(event => window.clearTimeout(event));
    document.getElementById("author"+filterId).value = "";
    document.getElementById("title"+filterId).value = "";
    document.getElementById("yearBegin"+filterId).value = "";
    document.getElementById("yearEnd"+filterId).value = "";
    map.getLayer("layer" + filterId).getSource().clear();
    map.getLayer("animation" + filterId).getSource().clear();
    map.getLayer("cities" + filterId).getSource().clear();
    document.getElementById("showHideButton"+filterId).disabled = true;
    document.getElementById("showHideCitiesButton"+filterId).disabled = true;
};

// Called when the visibility button is pressed. Shows or hides layer
const toggleTravelsVisibility = (filterId) => {
    const toggledLayer = map.getLayer("layer" + filterId);
    if (toggledLayer.getVisible()) {
        document.getElementById("showHideButton"+filterId).innerText = "Show travels";
        toggledLayer.setVisible(false);
    } else {
        document.getElementById("showHideButton"+filterId).innerText = "Hide travels";
        toggledLayer.setVisible(true);
    }
};

// Called when the visibility button is pressed. Shows or hides layer
const toggleCitiesVisibility = (filterId) => {
    cities[filterId] = {};
    const toggledLayer = map.getLayer("cities" + filterId);
    if (toggledLayer.getVisible()) {
        document.getElementById("showHideCitiesButton"+filterId).innerText = "Show Cities";
        toggledLayer.setVisible(false);
    } else {
        document.getElementById("showHideCitiesButton"+filterId).innerText = "Hide Cities";
        toggledLayer.setVisible(true);
    }
};

// Called when the Add Filter button is pressed. Create new fields and layer.
const addFilter = () => {
    timedEvents[filterCount] = [];

    const filterLayer = new ol.layer.Vector({
        source: new ol.source.Vector({
            wrapX: false,
            useSpatialIndex: false // optional, might improve performance
        }),
        id: "layer" + filterCount,
        visible: false,
        opacity: 0.4,
        style: (feature) => {
            if (feature.get('finished')) {
                return travelStyleFunction(feature, map.getView().getResolution());
            } else {
                return null;
            }
        },
        updateWhileAnimating: true, // optional, for instant visual feedback
        updateWhileInteracting: true // optional, for instant visual feedback
    });
    map.addLayer(filterLayer);

    const citiesLayer = new ol.layer.Vector({
        source: new ol.source.Vector({
            wrapX: false,
            useSpatialIndex: false // optional, might improve performance
        }),
        id: "cities"+filterCount,
        opacity: 0.7,
        style: (feature) => {
            // if the animation is still active for a feature, do not
            // render the feature with the layer style
            if (feature.getGeometry().getType() === "Circle") {
                return cityStyleFunction(feature, map.getView().getResolution());
            } else if (feature.get('finished')) {
                return travelStyleFunction(feature, map.getView().getResolution());
            } else {
                return null;
            }
        },
    });
    map.addLayer(citiesLayer);

    const animationLayer = new ol.layer.Vector({
        source: new ol.source.Vector({
            wrapX: false,
            useSpatialIndex: false // optional, might improve performance
        }),
        id: "animation"+filterCount,
        //opacity: 0.4,
        style: (feature) => {
            // if the animation is still active for a feature, do not
            // render the feature with the layer style
            if (feature.getGeometry().getType() === "Circle") {
                return cityStyleFunction(feature, map.getView().getResolution());
            } else if (feature.get('finished')) {
                return null;
                //return travelStyleFunction(feature, map.getView().getResolution());
            } else {
                return null;
            }
        },
    });
    map.addLayer(animationLayer);

    const para = document.createElement("div");
    para.id = "filter" + filterCount;
    para.style.color = colors[filterCount];
    para.innerHTML = `<label for="author${filterCount}">Author :</label>
            <input type="text" id="author${filterCount}">
            <label for="title${filterCount}">Title :</label>
            <input type="text" id="title${filterCount}">
            <label for="yearBegin${filterCount}">Between :</label>
            <input type="number" id="yearBegin${filterCount}">
            <label for="yearEnd${filterCount}">and :</label>
            <input type="number" id="yearEnd${filterCount}">
            <button onclick="filter(${filterCount})">Filter</button>
            <button onclick="clearFilter(${filterCount})">Clear</button>
            <button onclick="toggleTravelsVisibility(${filterCount})" disabled id="showHideButton${filterCount}">Show travels</button>
            <button onclick="toggleCitiesVisibility(${filterCount})" disabled id="showHideCitiesButton${filterCount}">Show cities</button>
            <button onclick="filter(${filterCount}, true)">Animate</button>`;
    const element = document.getElementById("filters");
    element.appendChild(para);
    filterCount++;
};

// Add first filter at launch
addFilter();

document.getElementById("addFilterButton").onclick = addFilter;

