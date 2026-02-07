// ----------------------------
// Global state
// ----------------------------
let data = [];
let filteredData = [];
let geoLayer = null;
let map = null;

// ----------------------------
// Load data first
// ----------------------------
fetch("data.json")
  .then(response => {
    if (!response.ok) {
      throw new Error("Failed to load data.json");
    }
    return response.json();
  })
  .then(json => {
    data = json;
    filteredData = [...data];
    initMap();
    initFilters();
  })
  .catch(err => {
    console.error("Data loading error:", err);
  });

// ----------------------------
// Map initialization
// ----------------------------
function initMap() {
  map = L.map("map").setView([20, 0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
  }).addTo(map);

  fetch("world.geojson")
    .then(response => {
      if (!response.ok) {
        throw new Error("Failed to load world.geojson");
      }
      return response.json();
    })
    .then(geojson => {
      geoLayer = L.geoJSON(geojson, {
        style: styleFeature,
        onEachFeature: (feature, layer) => {
          const code = feature.properties["ISO3166-1-Alpha-2"]?.toLowerCase();
          const countryName = feature.properties.name;
          if (!code) return;

          layer.on({
            click: () => selectCountry(code, countryName)
          });
        }
      }).addTo(map);
      
    })
    .catch(err => {
      console.error("GeoJSON loading error:", err);
    });
}

// ----------------------------
// Filters
// ----------------------------
function initFilters() {
  document.getElementById("loaFilter").addEventListener("change", applyFilters);
  document.getElementById("typeFilter").addEventListener("change", applyFilters);
  document.getElementById("flowFilter").addEventListener("change", applyFilters);
  applyFilters();
}

function applyFilters() {
  const loaValue = document.getElementById("loaFilter").value;
  const typeValue = document.getElementById("typeFilter").value;
  const flowValue = document.getElementById("flowFilter").value;

  filteredData = data.filter(item => {
    if (+loaValue && !item.loa?.includes(+loaValue)) {
      return false;
    }

    if (+typeValue && item.type !== +typeValue) {
      return false;
    }

    if (flowValue && !item.flowTypes?.includes(flowValue)) {
      return false;
    }

    return true;
  });

  updateMapStyle();
  countSupportedDigitalIdentities();
  clearDetailsPanel();
}

// ----------------------------
// Map styling
// ----------------------------
function getAvailableCountries() {
  const set = new Set();
  filteredData.forEach(item => {
    item.countries?.forEach(code => set.add(code.toLowerCase()));
  });
  return set;
}

function styleFeature(feature) {
  const code = feature.properties["ISO3166-1-Alpha-2"]?.toLowerCase();
  const available = getAvailableCountries();

  const isActive = code && available.has(code);

  return {
    fillColor: isActive ? "#4caf50" : "#dddddd",
    weight: 1,
    color: "#999",
    fillOpacity: isActive ? 0.8 : 0.3
  };
}

function updateMapStyle() {
  if (!geoLayer) return;
  geoLayer.setStyle(styleFeature);
}

// ----------------------------
// Country selection
// ----------------------------
function selectCountry(countryCode, countryName) {
  console.log("Selected country:", countryCode);
  const panel = document.getElementById("details");
  const items = filteredData.filter(item =>
    item.countries?.includes(countryCode)
  );

  panel.innerHTML = `<h2>${countryName}</h2>`;

  if (!items.length) {
    panel.innerHTML += "<p>No matching identities for current filters.</p>";
    return;
  }

  items.forEach(item => {
    panel.innerHTML += `
      <div style="margin-bottom:24px">
        <img src=${item.logoUrl} alt="${item.name} logo" height="24" style="vertical-align:middle; margin-right:8px; margin-bottom:6px"/>
        <strong>${item.name}</strong><br/>
        <small>
          Type: ${item.type}<br/>
          LoA: ${item.loa?.join(", ") || "-"}<br/>
          Action required: ${item.needAction}<br/>
          Flows: ${item.flowTypes?.join(", ") || "-"}<br/>
          Scopes: ${item.scopes?.join(", ") || "-"}
        </small>
      </div>
    `;
  });
}

// ----------------------------
// Helpers
// ----------------------------
function countSupportedDigitalIdentities() {
  let count = 0;
  filteredData.forEach(item => {
    count += item.countries?.length || 0;
  });
  const counter = document.getElementById("counter");
  counter.innerHTML = `<h3>${count} supported digital identit${count > 1 ? "ies" : "y"}</h3>`;
}

function clearDetailsPanel() {
  const panel = document.getElementById("details");
  panel.innerHTML = "<h2>Select a country</h2>";
}
