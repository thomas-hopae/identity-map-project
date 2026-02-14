// ----------------------------
// Global state
// ----------------------------
let data = [];
let filteredData = [];
let geoLayer = null;
let map = null;
let viewMode = 'map';
let countryMeta = {};
let selectedCountryCode = null;

// ----------------------------
// Type icon helpers (global)
// ----------------------------
function getTypeIconPath(t) {
  if (!t) return '';
  const map = {
    '1': 'icons/type-1-db-id.svg',
    '2': 'icons/type-2-nfc.svg',
    '3': 'icons/type-3-wallet-closed.svg'
  };
  return map[String(t)] || '';
}

function updateTypeIcon() {
  const typeIconEl = document.getElementById('typeFilterIcon');
  if (!typeIconEl) return;
  const val = document.getElementById('typeFilter')?.value;
  const path = getTypeIconPath(val);
  if (!path) {
    typeIconEl.style.display = 'none';
  } else {
    typeIconEl.src = path;
    typeIconEl.style.display = 'block';
  }
}

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
          const countryRegion = feature.properties.region;

          if (!code) return;

          layer.on({
            click: () => selectCountry(code, countryName, countryRegion)
          });
        }
      }).addTo(map);
      // ensure Leaflet recalculates container size after layers are added
      if (map && typeof map.invalidateSize === 'function') {
        map.whenReady(() => {
          setTimeout(() => {
            try { map.invalidateSize(); } catch (e) { /* ignore */ }
          }, 200);
        });
      }
      // build quick lookup map for country name and region by ISO2 code
      (geojson.features || []).forEach(f => {
        const code = f.properties["ISO3166-1-Alpha-2"]?.toLowerCase();
        if (code) {
          countryMeta[code] = {
            name: f.properties.name,
            region: f.properties.region || 'Unknown'
          };
        }
      });
      
    })
    .catch(err => {
      console.error("GeoJSON loading error:", err);
    });
}

// ----------------------------
// Filters
// ----------------------------
function initFilters() {
  document.getElementById("typeFilter").addEventListener("change", applyFilters);
  document.getElementById("loaFilter").addEventListener("change", applyFilters);
  document.getElementById("regionFilter").addEventListener("change", applyFilters);
  
  // init & update the small icon next to the type select
  updateTypeIcon();
  document.getElementById('typeFilter').addEventListener('change', updateTypeIcon);
  
  const viewToggle = document.getElementById('viewSwitch');
  if (viewToggle) {
    document.body.dataset.view = viewMode;
    viewToggle.checked = false; // default to map view
    viewToggle.addEventListener('change', (e) => {
      viewMode = e.target.checked ? 'list' : 'map';
      document.body.dataset.view = viewMode;
      console.log('View mode:', viewMode);
      if (viewMode === 'list') {
        renderListView();
      }
        if (viewMode === 'map' && map && typeof map.invalidateSize === 'function') {
          // need a short delay for layout to settle
          setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 120);
        }
    });
  }
  
  // keep map size in sync on window resize
  window.addEventListener('resize', () => { if (map && typeof map.invalidateSize === 'function') { try { map.invalidateSize(); } catch (e) {} } });
  applyFilters();
}

function applyFilters() {
  // unselect ciountry when filters change
  selectedCountryCode = null;

  const loaValue = document.getElementById("loaFilter").value;
  const typeValue = document.getElementById("typeFilter").value;
  const regionValue = document.getElementById("regionFilter").value;

  filteredData = data.filter(item => {
    if (+loaValue && !item.loa?.includes(+loaValue)) {
      return false;
    }

    if (+typeValue && item.type !== +typeValue) {
      return false;
    }

    if (regionValue) {
      const itemHasRegion = item.countries?.some(code => {
        const meta = countryMeta[code.toLowerCase()];
        return meta && meta.region === regionValue;
      });
      if (!itemHasRegion) {
        return false;
      }
    }

    return true;
  });

  updateMapStyle();
  countSupportedDigitalIdentities();
  clearDetailsPanel();
  if (viewMode === 'list') renderListView();
}

// ----------------------------
// Map styling
// ----------------------------
function getAvailableCountries() {
  const regionValue = document.getElementById("regionFilter").value;
  const set = new Set();
  filteredData.forEach(item => {
    item.countries?.forEach(code => {
      const meta = countryMeta[code.toLowerCase()];
      if (!regionValue || meta?.region === regionValue) {
        set.add(code.toLowerCase());
      }
    });
  });
  return set;
}

function styleFeature(feature) {
  const code = feature.properties["ISO3166-1-Alpha-2"]?.toLowerCase();
  const available = getAvailableCountries();

  const isActive = code && available.has(code);
  const isSelected = code && code === selectedCountryCode;

  return {
    fillColor: isSelected ? "#9c27b0" : (isActive ? "#4caf50" : "#dddddd"),
    weight: isSelected ? 2 : 1,
    color: isSelected ? "#7b1fa2" : "#999",
    fillOpacity: isSelected ? 0.9 : (isActive ? 0.8 : 0.3)
  };
}

function updateMapStyle() {
  if (!geoLayer) return;
  geoLayer.setStyle(styleFeature);
}

// ----------------------------
// Country selection
// ----------------------------
function selectCountry(countryCode, countryName, countryRegion) {
  console.log("Selected country:", countryCode);
  selectedCountryCode = countryCode?.toLowerCase() || null;
  updateMapStyle();
  if (viewMode === 'list') renderListView();
  
  const panel = document.getElementById("details");
  const items = filteredData.filter(item =>
    item.countries?.some(c => c.toLowerCase() === String(countryCode).toLowerCase())
  );

  panel.innerHTML = `<small>${countryRegion}</small><h2 class="selected-country">${countryName}</h2><small>${items.length} digital identit${items.length > 1 ? "ies" : "y"} available</small><hr/>`;

  if (!items.length) {
    panel.innerHTML += "<p class=\"x-small\">No matching identities for current filters.</p>";
    return;
  }

  items.forEach(item => {
    panel.innerHTML += `
      <div style="margin-bottom:24px; border-bottom:1px solid #4caf50;">
        <img src=${item.logoUrl} alt="${item.name} logo" height="24" style="vertical-align:middle; margin-right:8px; margin-bottom:6px"/>
        <strong>${item.name}</strong><br/>
        <small>
          <strong>Type:</strong> ${item.type}<br/>
          <strong>LoA:</strong> ${item.loa?.join(", ") || "-"}<br/>
          <strong>Flows:</strong> ${item.flowTypes?.join(", ") || "-"}<br/>
          <strong>Scopes:</strong> <ul><li>${item.scopes?.join("</li><li>") || "-"}</li></ul>
        </small>
      </div>
    `;
  });
}

// ----------------------------
// List view rendering
// ----------------------------
function renderListView() {
  const regionValue = document.getElementById("regionFilter").value;
  const listEl = document.getElementById('list');
  if (!listEl) return;

  // Build per-country aggregation from filteredData
  const countryMap = {}; // key: iso2 lower
  filteredData.forEach(item => {
    (item.countries || []).forEach(code => {
      const k = code.toLowerCase();
      const meta = countryMeta[k];
      if (!regionValue || meta?.region === regionValue) {
        if (!countryMap[k]) {
          countryMap[k] = { code: k, items: [], name: (meta && meta.name) || k.toUpperCase(), region: (meta && meta.region) || 'Unknown' };
        }
        countryMap[k].items.push(item);
      }
    });
  });

  // Group by region
  const regions = {};
  Object.values(countryMap).forEach(c => {
    const loaSet = new Set();
    const typeSet = new Set();

    c.items.forEach(item => {
      (item.loa || []).forEach(l => loaSet.add(l));
      if (item.type !== undefined && item.type !== null) typeSet.add(item.type);
    });

    c.loa = Array.from(loaSet).sort((a,b)=>a-b);
    c.types = Array.from(typeSet).sort((a,b)=>a-b);

    if (!regions[c.region]) regions[c.region] = [];
    regions[c.region].push(c);
  });

  const regionNames = Object.keys(regions).sort();
  let html = '';
  regionNames.forEach(rn => {
    html += `<section class="region"><h3>${rn}</h3>`;
    regions[rn].sort((a,b) => a.name.localeCompare(b.name)).forEach(c => {
      const typeIcons = (c.types || []).map(t => {
        const p = getTypeIconPath(t);
        return p ? `<img src="${p}" class="list-type-icon" alt="type-${t}"/>` : '';
      }).join('');

      html += `<a href="#" class="country-link x-small" data-code="${c.code}" data-name="${c.name}" data-region="${c.region}">${c.name}</a>${typeIcons}<br/>`;
    });
    html += `</section>`;
  });

  if (!html) html = '<div class="x-small" style="padding:18px">No countries match current filters.</div>';
  listEl.innerHTML = html;

  // wire click handlers for the country links to reuse selectCountry
  listEl.querySelectorAll('.country-link').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      const code = el.dataset.code;
      const name = el.dataset.name;
      const region = el.dataset.region;
      selectCountry(code, name, region);
    });
    
    // Highlight selected country in list
    if (el.dataset.code === selectedCountryCode) {
      el.classList.add('selected');
    }
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
  counter.innerHTML = `<h3><span>${count}</span> digital identit${count > 1 ? "ies" : "y"} supported</h3>`;
}

function clearDetailsPanel() {
  const panel = document.getElementById("details");
  panel.innerHTML = "<h2>Select a country</h2>";
}
