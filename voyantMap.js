// Speed of vectors drawing
let pointsPerMs = 0.1;

// Time between vectors drawing
let delayBetweenVectors = 100 / pointsPerMs;

// Used to keep track of number of filters
let filterCount = 1;

let timedEvents = [[]];

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
        zoom: 4
    })
});

// Add a click handler to the map to render the popup.
map.on('singleclick', (event) => {
    const pixel = event.pixel;
    const features = map.getFeaturesAtPixel(pixel);
    if(features) {
        let infos = "<ul>";
        let i = 0;
        while(features[i].get("selected")){
            i++;
        }
        const feature = features[i];
        const featureInfos = feature.get("infos");
        featureInfos.forEach((info) => {
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
    delayBetweenVectors = 100 / pointsPerMs;
};

// Style for vector after animation
const travelStyleFunction = (feature, resolution) => {
    // default color is red, selected feature is blue and first 8 layers have pre-defined colors
    let color = "rgba(255, 0, 0, 0.5)";
    if (feature.get("selected")) {
        color = "rgb(0, 0, 255)";
    } else if (feature.get("color")) {
        color = feature.get("color");
    }

    const stroke = new ol.style.Stroke({
        color: color,
        width: 1 + feature.get("occurences") * 0.5
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

// Style for vector during animation
const vectorStyleFunction = (feature) => {
    const color = feature.get("color");
    return (new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: color,
            width: 1 + feature.get("occurences") * 0.5
        })
    }));
};

// Add feature to layer with a delay
const addLater = (feature, timeout, layerId) => {
    const timedEvent = window.setTimeout(() => {
        feature.set('start', new Date().getTime());
        const layers = map.getLayers();
        let i = 0;
        while(layers.item(i).get("id") !== "layer" + layerId) {
            i++;
        }
        const layer = layers.item(i);
        const source = layer.getSource();
        source.addFeature(feature);
    }, timeout);
    timedEvents[layerId].push(timedEvent);
};

// Animate travels for a layer
const animateTravels = (event, layerId) => {
    const vectorContext = event.vectorContext;
    const frameState = event.frameState;
    const layers = map.getLayers();
    let i = 0;
    while(layers.item(i).get("id") !== "layer" + layerId) {
        i++;
    }
    const layer = layers.item(i);
    const features = layer.getSource().getFeatures();
    features.forEach( (feature) => {
        if (!feature.get('finished')) {
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
    } );
    // tell OpenLayers to continue the animation
    map.render();
};

// Initial layer for first filter
const travelsLayer = new ol.layer.Vector({
    source: new ol.source.Vector({
        wrapX: false,
        useSpatialIndex: false // optional, might improve performance
    }),
    id: "layer0",
    opacity: 0.7,
    style: (feature) => {
        // if the animation is still active for a feature, do not
        // render the feature with the layer style
        if (feature.get('finished')) {
            return travelStyleFunction(feature, map.getView().getResolution());
        } else {
            return null;
        }
    },
});
map.addLayer(travelsLayer);

// Layer for selected vector
const selectedLayer = new ol.layer.Vector({
    map: map,
    source: new ol.source.Vector({
        wrapX: false,
        useSpatialIndex: false // optional, might improve performance
    }),
    zIndex:10,
    selected: true,
    style: travelStyleFunction,
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
        }
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
});

// Called when the filter button is pressed. Shows all vectors instantly.
const filter = (filterId) => {
    timedEvents[filterId].forEach(event => window.clearTimeout(event));
    const layers = map.getLayers();
    let i = 0;
    while(layers.item(i).get("id") !== "layer" + filterId) {
        i++;
    }
    const vectorLayer = layers.item(i);
    vectorLayer.setVisible(true);
    document.getElementById("showHideButton"+filterId).innerText = "Hide";
    vectorLayer.getSource().clear();
    const url = 'travels.json';
    fetch(url).then((response) => response.json()).then((json) => {
        const travelsData = json.travels;
        let i = 0;
        travelsData.forEach((travel) => {
            const from = travel.coordinates[0];
            const to = travel.coordinates[1];
            const author = document.getElementById("author"+filterId).value;
            const title = document.getElementById("title"+filterId).value;
            const yearBegin = document.getElementById("yearBegin"+filterId).value;
            const yearEnd = document.getElementById("yearEnd"+filterId).value;
            let infos = travel.infos.filter((info) => info.author.includes(author));
            infos = infos.filter((info) => info.title.includes(title));
            infos = yearBegin === "" ? infos : infos.filter((info) => info.year >= yearBegin);
            infos = yearEnd === "" ? infos : infos.filter((info) => info.year <= yearEnd);

            if(infos.length !== 0){
                const text = travel.description + "(" + infos.length + ")";
                // create an arc circle between the two locations
                const arcGenerator = new arc.GreatCircle(
                    {x: from[1], y: from[0]},
                    {x: to[1], y: to[0]});

                const arcLine = arcGenerator.Arc(1000, {offset: 10});
                if (arcLine.geometries.length === 1) {
                    const line = new ol.geom.LineString(arcLine.geometries[0].coords);
                    line.transform(ol.proj.get('EPSG:4326'), ol.proj.get('EPSG:3857'));
                    const color = colors[filterId];
                    const feature = new ol.Feature({
                        geometry: line,
                        text: text,
                        finished: true,
                        occurences: infos.length,
                        infos: infos,
                        color: color,
                    });
                    // add the feature with a delay so that the animation
                    // for all features does not start at the same time
                    addLater(feature, 0, filterId);
                    i++
                }
            }
        });
    });
    document.getElementById("showHideButton"+filterId).disabled = false;
};

// Called when the animate button is pressed.
const showAnimation = (filterId) => {
    timedEvents[filterId].forEach(event => window.clearTimeout(event));
    const layers = map.getLayers();
    let i = 0;
    while(layers.item(i).get("id") !== "layer" + filterId) {
        i++;
    }
    const vectorLayer = layers.item(i);
    vectorLayer.setVisible(true);
    document.getElementById("showHideButton"+filterId).innerText = "Hide";
    vectorLayer.getSource().clear();
    const url = 'travels.json';
    fetch(url).then((response) => response.json()).then((json) => {
        const travelsData = json.travels;
        let i = 0;
        travelsData.forEach((travel) => {
            const from = travel.coordinates[0];
            const to = travel.coordinates[1];
            const author = document.getElementById("author"+filterId).value;
            const title = document.getElementById("title"+filterId).value;
            const yearBegin = document.getElementById("yearBegin"+filterId).value;
            const yearEnd = document.getElementById("yearEnd"+filterId).value;
            let infos = travel.infos.filter((info) => info.author.includes(author));
            infos = infos.filter((info) => info.title.includes(title));
            infos = yearBegin === "" ? infos : infos.filter((info) => info.year >= yearBegin);
            infos = yearEnd === "" ? infos : infos.filter((info) => info.year <= yearEnd);

            if(infos.length !== 0){
                const text = travel.description + "(" + infos.length + ")";
                // create an arc circle between the two locations
                const arcGenerator = new arc.GreatCircle(
                    {x: from[1], y: from[0]},
                    {x: to[1], y: to[0]});

                const arcLine = arcGenerator.Arc(100, {offset: 10});
                if (arcLine.geometries.length === 1) {
                    const line = new ol.geom.LineString(arcLine.geometries[0].coords);
                    line.transform(ol.proj.get('EPSG:4326'), ol.proj.get('EPSG:3857'));
                    const color = colors[filterId];
                    const feature = new ol.Feature({
                        geometry: line,
                        text: text,
                        finished: false,
                        occurences: infos.length,
                        infos: infos,
                        color: color,
                    });
                    // add the feature with a delay so that the animation
                    // for all features does not start at the same time
                    addLater(feature, i * delayBetweenVectors, filterId);
                    i++
                }
            }
        });
        map.on('postcompose', (event) => animateTravels(event, filterId));
    });
    document.getElementById("showHideButton"+filterId).disabled = false;
};

// Clear filter fields and layer
const clearFilter = (filterId) => {
    timedEvents[filterId].forEach(event => window.clearTimeout(event));
    document.getElementById("author"+filterId).value = "";
    document.getElementById("title"+filterId).value = "";
    document.getElementById("yearBegin"+filterId).value = "";
    document.getElementById("yearEnd"+filterId).value = "";
    const layers = map.getLayers();
    let i = 0;
    while(layers.item(i).get("id") !== "layer" + filterId) {
        i++;
    }
    const clearedLayer = layers.item(i);
    document.getElementById("showHideButton"+filterId).disabled = true;
    clearedLayer.getSource().clear();
};

// Called when the visibility button is pressed. Shows or hides layer
const toggleVisibility = (filterId) => {
    timedEvents[filterId].forEach(event => window.clearTimeout(event));
    const layers = map.getLayers();
    let i = 0;
    while(layers.item(i).get("id") !== "layer" + filterId) {
        i++;
    }
    const toggledLayer = layers.item(i);
    if (toggledLayer.getVisible()) {
        document.getElementById("showHideButton"+filterId).innerText = "Show";
        toggledLayer.setVisible(false);
    } else {
        document.getElementById("showHideButton"+filterId).innerText = "Hide";
        toggledLayer.setVisible(true);
    }
};

// Attach onclicks event to first layer buttons
document.getElementById("filterButton0").onclick = () => filter(0);

document.getElementById("showHideButton0").onclick = () => toggleVisibility(0);

document.getElementById("clearButton0").onclick = () => clearFilter(0);

document.getElementById("animateButton0").onclick = () => showAnimation(0);

// Called when the Add Filter button is pressed. Create new fields and layer.
document.getElementById("addFilter").onclick = () => {
    timedEvents[filterCount] = [];
    const filterLayer = new ol.layer.Vector({
        source: new ol.source.Vector({
            wrapX: false,
            useSpatialIndex: false // optional, might improve performance
        }),
        id: "layer" + filterCount,
        visible: false,
        opacity: 0.7,
        style: (feature) => {
            // if the animation is still active for a feature, do not
            // render the feature with the layer style
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
            <button onclick="toggleVisibility(${filterCount})" disabled id="showHideButton${filterCount}">Show</button>
            <button onclick="showAnimation(${filterCount})">Animate</button>`;
    const element = document.getElementById("filters");
    element.appendChild(para);
    filterCount++;
};
