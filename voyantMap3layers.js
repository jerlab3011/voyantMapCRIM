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
// Constant that changes how zoomed the map must be for cities with less occurences to appear
// The lower the value, the sooner small cities will appear
const zoomTreshold = 50;

// Constant that changes how bigger cities with more occurences are compared to cities with fewer
// The higher the value, the bigger the difference will be
const sizeRatio = 50000;

// global variable for number of location occurences found in corpus
let nbOfEntries = 0;

// Speed of vectors drawing
let pointsPerMs = 0.3;

// Number of points per arc. More points means more dense and rounded arcs but may affect performance
const pointsPerArc = 100;

// Time between vectors drawing
let delayBetweenVectors = pointsPerArc / pointsPerMs;

// Used to keep track of number of filters
let filterCount = 0;

// Array to keep track of delayed event for animation
let timedEvents = [[]];

// Array to contain city features
let cities = [];

let citiesShown = [];

const coordinatesSequence = [];
const travels = [];

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
                cacheize: 2048,
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
        let feature = undefined;
        features.forEach( (feat) => {
            if( feat.getGeometry().getType() === "Circle" && !feat.get("selected")) {
                feature = feat;
            }
        });
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
        width: 2 + feature.get("occurences") * 0.1
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
const cityStyleFunction = (feature, resolution) => {
    const zoom = map.getView().getZoom();
    // default color is red, selected feature is blue and first 8 layers have pre-defined colors
    let color = "rgb(255, 0, 0)";
    if (feature.get("selected")) {
        color = "rgb(0, 0, 255)";
    } else if (feature.get("color")) {
        color = feature.get("color");
    }
    const width = 5 + Math.sqrt(feature.get("occurences")/parseFloat(nbOfEntries) * sizeRatio);
    if (width * zoom > zoomTreshold){
        cities[feature.get("filterId")][feature.get("coordinates")][1] = true;
        return (new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: color,
                width: width,
            })
        }));
    } else {
        cities[feature.get("filterId")][feature.get("coordinates")][1] = false;
        return false;
    }
};

// Style for vector during animation
const animationStyleFunction = (feature) => {
    let color = "rgb(255, 0, 0)";
    if (feature.get("color")) {
        color = feature.get("color");
    }
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
                vectorContext.setStyle(animationStyleFunction(feature));
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
        while(features[i].get("selected")){
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
                filterId: feature.get("filterId"),
                coordinates: feature.get("coordinates")
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


// Called when the filter button is pressed
const filter = (filterId) => {
    timedEvents[filterId].forEach(event => window.clearTimeout(event));
    cities[filterId] = [];
    coordinatesSequence[filterId] = [];
    const citiesLayer = map.getLayer("cities" + filterId);
    citiesLayer.getSource().clear();
    const vectorLayer = map.getLayer("layer" + filterId);
    vectorLayer.setVisible(true);
    document.getElementById("showHideButton" + filterId).innerText = "Hide travels";
    document.getElementById("showHideCitiesButton" + filterId).innerText = "Hide cities";
    vectorLayer.getSource().clear();
    const url = 'cities3.json';
    map.getView().on("change:resolution", () => {
        //TODO find the right event to listen to before calling the function
        window.setTimeout(() => generateTravels(filterId), 500);
    });
    fetch(url).then((response) => response.json()).then((json) => {
        const citiesData = json.cities;
        nbOfEntries = citiesData.length;
        let previousCity = false;
        citiesData.forEach((city) => {
            const author = document.getElementById("author" + filterId).value.toLowerCase();
            const title = document.getElementById("title" + filterId).value.toLowerCase();
            const yearBegin = document.getElementById("yearBegin" + filterId).value;
            const yearEnd = document.getElementById("yearEnd" + filterId).value;
            if(city.infos[0].author.toLowerCase().includes(author) &&
                city.infos[0].title.toLowerCase().includes(title) &&
                (yearBegin === "" || city.infos[0].year >= yearBegin) &&
                (yearEnd === "" || city.infos[0].year <= yearEnd)) {
                const coordinates = [parseFloat(city.coordinates[1]), parseFloat(city.coordinates[0])];
                coordinatesSequence[filterId].push(coordinates);
                if(!cities[filterId][coordinates]) {
                    const circle = new ol.geom.Circle(coordinates);
                    circle.transform(ol.proj.get('EPSG:4326'), ol.proj.get('EPSG:3857'));
                    const color = colors[filterId];
                    const feature = new ol.Feature({
                        geometry: circle,
                        description: city.description,
                        text: city.description + "(1)",
                        finished: true,
                        infos: city.infos,
                        color: color,
                        occurences: 1,
                        filterId: filterId,
                        coordinates: coordinates
                    });
                    citiesLayer.getSource().addFeature(feature);
                    cities[filterId][coordinates] = [feature, true];
                } else {
                    const feature = cities[filterId][coordinates][0];
                    const occurences = feature.get("occurences") + 1;
                    const infos = feature.get("infos");
                    const text = city.description + "("+occurences+")";
                    infos.push(city.infos[0]);
                    feature.set("occurences", occurences);
                    feature.set("infos", infos);
                    feature.set("text", text);
                }
                /**
                if(previousCity &&
                    (previousCity.coordinates[0] !== coordinates[0] || previousCity.coordinates[1] !== coordinates[1])) {
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
                            finished: true,
                            infos: city.infos,
                            color: color,
                            filterId: filterId,
                            start: previousCity.coordinates,
                            end: coordinates
                        });
                        vectorLayer.getSource().addFeature(feature);
                    })
                }
                previousCity = {coordinates:coordinates, description: city.description};
                 **/
            }
        });
    });
    //TODO find the right event to listen to before calling the function
    window.setTimeout(() => generateTravels(filterId), 100);

    document.getElementById("showHideButton" + filterId).disabled = false;
    document.getElementById("showHideCitiesButton" + filterId).disabled = false;
    const button = document.getElementById("animateButton"+filterId);
    button.disabled = false;
    button.innerText = "Animate";
    button.onclick = () => animateLayer(filterId);
};

const generateTravels = (filterId) => {
    const vectorLayer = map.getLayer("layer" + filterId);
    vectorLayer.getSource().clear();
    travels[filterId] = [];
    let previousCoordinates = coordinatesSequence[filterId][0];
    for (let i = 1; i < coordinatesSequence[filterId].length; i++) {
        const coordinates = coordinatesSequence[filterId][i];
        const key = [previousCoordinates, coordinates];
        if ((previousCoordinates[0] !== coordinates[0] || previousCoordinates[1] !== coordinates[1]) &&
            cities[filterId][coordinates][1]) {
            if(!travels[filterId][key]) {
                const previousCity = cities[filterId][previousCoordinates][0].get("description");
                const nextCity = cities[filterId][coordinates][0].get("description");
                const description = `${previousCity}-${nextCity}`;
                // create an arc circle between the two locations
                const arcGenerator = new arc.GreatCircle(
                    {x: previousCoordinates[0], y: previousCoordinates[1]},
                    {x: coordinates[0], y: coordinates[1]});

                const arcLine = arcGenerator.Arc(pointsPerArc, {offset: 100});
                arcLine.geometries.forEach(geometry => {
                    const line = new ol.geom.LineString(geometry.coords);
                    line.transform(ol.proj.get('EPSG:4326'), ol.proj.get('EPSG:3857'));
                    const color = colors[filterId];
                    const feature = new ol.Feature({
                        geometry: line,
                        description: description,
                        text: description + "(1)",
                        finished: true,
                        occurences:1,
                        //infos: city.infos,
                        color: color,
                        filterId: filterId,
                        start: previousCoordinates,
                        end: coordinates
                    });
                    vectorLayer.getSource().addFeature(feature);
                    travels[filterId][key] = feature;
                });
                previousCoordinates = coordinates;
            } else {
                const occurences = travels[filterId][key].get("occurences");
                const text = travels[filterId][key].get("description") + "(" + occurences + ")";
                travels[filterId][key].set("occurences", occurences + 1);
                travels[filterId][key].set("text", text);
            }

        }
    }
};

// Called when the animate button is pressed
const animateLayer = (filterId) => {
    timedEvents[filterId].forEach(event => window.clearTimeout(event));
    const filterLayer = map.getLayer("layer" + filterId);
    let i = 0;
    let crossedDateLine = false;
    let secondPartDelay = 0;
    filterLayer.getSource().getFeatures().forEach( (feature) => {
        const animationFeature = new ol.Feature({
            geometry: feature.getGeometry(),
            color: feature.get("color"),
            finished: false,
        });

        // This fix animation for travels crossing the date line
        if(animationFeature.getGeometry().getCoordinates().length < pointsPerArc) {
            if (crossedDateLine) {
                crossedDateLine = false;
                addLater(animationFeature, secondPartDelay, filterId);
                i++;
            } else {
                addLater(animationFeature, i * delayBetweenVectors, filterId);
                crossedDateLine = true;
                secondPartDelay = i * delayBetweenVectors + animationFeature.getGeometry().getCoordinates().length / pointsPerMs;
            }
        } else {
            addLater(animationFeature, i * delayBetweenVectors, filterId);
            i++;
        }
    });
    map.on('postcompose', (event) => animateTravels(event, filterId));
    const button = document.getElementById("animateButton"+filterId);
    button.innerText = "Stop";
    button.onclick = () => stopAnimation(filterId);
    // event to swich back button to animate once animation is done
    // TODO change timeout to reflect only shown features
    const restoreAnimate = window.setTimeout(() => {
        button.innerText = "Animate";
        button.onclick = () => animateLayer(filterId);
    }, delayBetweenVectors * (filterLayer.getSource().getFeatures().length - 1) );
    timedEvents[filterId].push(restoreAnimate);
};

const stopAnimation = (filterId) => {
    timedEvents[filterId].forEach(event => window.clearTimeout(event));
    const button = document.getElementById("animateButton"+filterId);
    button.innerText = "Animate";
    button.onclick = () => animateLayer(filterId);
};

// Clear filter fields and layer
const clearFilter = (filterId) => {
    cities[filterId] = {};
    timedEvents[filterId].forEach(event => window.clearTimeout(event));
    document.getElementById("author" + filterId).value = "";
    document.getElementById("title" + filterId).value = "";
    document.getElementById("yearBegin" + filterId).value = "";
    document.getElementById("yearEnd" + filterId).value = "";
    map.getLayer("layer" + filterId).getSource().clear();
    map.getLayer("animation" + filterId).getSource().clear();
    map.getLayer("cities" + filterId).getSource().clear();
    document.getElementById("showHideButton" + filterId).disabled = true;
    document.getElementById("showHideCitiesButton" + filterId).disabled = true;
    const button = document.getElementById("animateButton"+filterId);
    button.disabled = true;
    button.innerText = "Animate";
    button.onclick = () => animateLayer(filterId);
};

// Called when the travels visibility button is pressed.
const toggleTravelsVisibility = (filterId) => {
    const toggledLayer = map.getLayer("layer" + filterId);
    if (toggledLayer.getVisible()) {
        document.getElementById("showHideButton" + filterId).innerText = "Show travels";
        toggledLayer.setVisible(false);
    } else {
        document.getElementById("showHideButton" + filterId).innerText = "Hide travels";
        toggledLayer.setVisible(true);
    }
};

// Called when the cities visibility button is pressed.
const toggleCitiesVisibility = (filterId) => {
    cities[filterId] = {};
    const toggledLayer = map.getLayer("cities" + filterId);
    if (toggledLayer.getVisible()) {
        document.getElementById("showHideCitiesButton" + filterId).innerText = "Show cities";
        toggledLayer.setVisible(false);
    } else {
        document.getElementById("showHideCitiesButton" + filterId).innerText = "Hide cities";
        toggledLayer.setVisible(true);
    }
};

// Called when the Add Filter button is pressed. Create new fields and layer.
const addFilter = () => {
    timedEvents[filterCount] = [];
    citiesShown[filterCount] = [];
    travels[filterCount] = [];
    const filterLayer = new ol.layer.Vector({
        source: new ol.source.Vector({
            wrapX: false,
            useSpatialIndex: false // optional, might improve performance
        }),
        id: "layer" + filterCount,
        visible: false,
        opacity: 0.4,
        style: travelStyleFunction,
        updateWhileAnimating: false, // optional, for instant visual feedback
        updateWhileInteracting: false // optional, for instant visual feedback
    });
    map.addLayer(filterLayer);

    const citiesLayer = new ol.layer.Vector({
        source: new ol.source.Vector({
            wrapX: false,
            useSpatialIndex: false // optional, might improve performance
        }),
        id: "cities" + filterCount,
        opacity: 0.7,
        style: cityStyleFunction
    });
    map.addLayer(citiesLayer);
    const animationLayer = new ol.layer.Vector({
        source: new ol.source.Vector({
            wrapX: false,
            useSpatialIndex: false // optional, might improve performance
        }),
        id: "animation" + filterCount,
        style: null
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
            <button onclick="animateLayer(${filterCount})" disabled id="animateButton${filterCount}">Animate</button>`;
    const element = document.getElementById("filters");
    element.appendChild(para);
    filterCount++;
};

// Add first filter at launch
addFilter();

document.getElementById("addFilterButton").onclick = addFilter;

// Fixes bug that displays maps wrong before browser resize
window.setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
}, 100);
