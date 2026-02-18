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
let yearMap = {};
let yearTimer = null;
let isYearPlaying = false;
let yearAnimIndex = 0;

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

// (removed updateTypeIcon) icons are rendered inside the dropdown options now

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
    // load year of first issuance data
    fetch('yearOfFirstIssuance.json')
      .then(r => { if (!r.ok) throw new Error('Failed to load yearOfFirstIssuance.json'); return r.json(); })
      .then(years => {
        yearMap = {};
        (years || []).forEach(y => { if (y && y.id) yearMap[y.id] = y.firstIssuanceYear; });
        filteredData = [...data];
        initMap();
        initFilters();
      })
      .catch(err => {
        console.warn('Could not load yearOfFirstIssuance.json:', err);
        filteredData = [...data];
        initMap();
        initFilters();
      });
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
// Build a custom multi-select UI from an existing <select multiple>.
function buildMultiSelect(selectId, placeholder) {
  const select = document.getElementById(selectId);
  if (!select) return;
  // hide native select (keep it for accessibility/form value)
  select.style.display = 'none';

  const wrapper = document.createElement('div');
  wrapper.className = 'multi-select';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ms-toggle';
  wrapper.appendChild(toggle);

  const dropdown = document.createElement('div');
  dropdown.className = 'ms-dropdown';
  dropdown.style.display = 'none';

  Array.from(select.options).forEach(opt => {
    // skip empty placeholder option in the checkbox list
    if (!opt.value) return;
    const label = document.createElement('label');
    label.className = 'ms-option';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = opt.value;
    cb.checked = opt.selected;
    const span = document.createElement('span');
    span.textContent = opt.text;
    cb.addEventListener('change', () => {
      // sync to native select
      for (let so of select.options) {
        if (so.value === cb.value) so.selected = cb.checked;
      }
      // if no box is checked, ensure the empty option is selected (treated as All)
      const anyChecked = Array.from(dropdown.querySelectorAll('input[type=checkbox]')).some(i => i.checked);
      if (!anyChecked) {
        // clear all native selections
        for (let so of select.options) so.selected = false;
      }
      applyFilters();
      updateToggleText();
    });
    label.appendChild(cb);
    // if this is the type filter, show the icon for the option inside the dropdown
    if (selectId === 'typeFilter') {
      const iconPath = getTypeIconPath(opt.value);
      if (iconPath) {
        const img = document.createElement('img');
        img.src = iconPath;
        img.alt = '';
        img.className = 'ms-option-icon';
        label.appendChild(img);
      }
    }
    label.appendChild(span);
    dropdown.appendChild(label);
  });

  wrapper.appendChild(dropdown);

  // insert wrapper immediately after the select element
  select.parentNode.insertBefore(wrapper, select.nextSibling);

  let isOpen = false;
  function positionDropdown() {
    const rect = toggle.getBoundingClientRect();
    // ensure dropdown is positioned relative to viewport (fixed)
    dropdown.style.position = 'fixed';
    dropdown.style.zIndex = '9999';
    // set left/top with small margin
    let left = rect.left;
    let top = rect.bottom + 8;
    // ensure min-width at least toggle width
    dropdown.style.minWidth = rect.width + 'px';
    // adjust horizontal overflow
    const ddW = dropdown.offsetWidth || 220;
    if (left + ddW > window.innerWidth - 12) left = Math.max(12, window.innerWidth - ddW - 12);
    // adjust vertical if not enough space below
    const ddH = dropdown.offsetHeight || 200;
    if (top + ddH > window.innerHeight - 12) {
      // place above toggle
      top = rect.top - ddH - 8;
      if (top < 12) top = 12;
    }
    dropdown.style.left = left + 'px';
    dropdown.style.top = top + 'px';
  }

  function openDropdown() {
    isOpen = true;
    dropdown.style.display = 'block';
    positionDropdown();
    window.addEventListener('resize', positionDropdown);
    window.addEventListener('scroll', positionDropdown, true);
  }

  function closeDropdown() {
    isOpen = false;
    dropdown.style.display = 'none';
    try { window.removeEventListener('resize', positionDropdown); } catch (e) {}
    try { window.removeEventListener('scroll', positionDropdown, true); } catch (e) {}
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen) closeDropdown(); else openDropdown();
  });

  // close when clicking outside
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) closeDropdown();
  });

  function updateToggleText() {
    const selected = Array.from(select.selectedOptions).map(o => o.text).filter(Boolean);
    if (selected.length) {
      toggle.textContent = `${selected.length} filters applied`;
    } else {
      toggle.textContent = (placeholder || 'All');
    }
    // update active filters area
    try { updateActiveFilters(); } catch (e) {}
  }

  updateToggleText();
}

function initFilters() {
  // build custom multi-select UIs from the native selects
  buildMultiSelect('typeFilter', 'All digital ID types');
  buildMultiSelect('loaFilter', 'All LoA');
  buildMultiSelect('regionFilter', 'All regions');
  // populate year filter from yearMap (single select)
  const yearSelect = document.getElementById('yearFilter');
  if (yearSelect) {
    // gather unique years (exclude null/undefined), sort ascending
    const years = Array.from(new Set(Object.values(yearMap).filter(y => y !== null && y !== undefined))).sort((a,b)=>a-b);
    yearSelect.innerHTML = '<option value="">All years</option>';
    years.forEach(y => {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.text = String(y);
      yearSelect.appendChild(opt);
    });
    yearSelect.addEventListener('change', () => { applyFilters(); try { updateActiveFilters(); } catch(e){} });
    // animation controls for stepping through years
    const playBtn = document.getElementById('yearPlayButton');
    const yearOptions = years.slice();
    function stopYearAnimation() {
      if (yearTimer) { clearInterval(yearTimer); yearTimer = null; }
      isYearPlaying = false;
      yearAnimIndex = 0;
      if (playBtn) { playBtn.setAttribute('aria-pressed', 'false');
        playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8 5v14l11-7L8 5z" fill="currentColor"/></svg>`;
      }
    }
    function startYearAnimation() {
      if (!yearOptions.length) return;
      // ensure stopped state
      stopYearAnimation();
      isYearPlaying = true;
      if (playBtn) { playBtn.setAttribute('aria-pressed','true'); playBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 6h4v12H6zM14 6h4v12h-4z" fill="currentColor"/></svg>`; }
      yearAnimIndex = 0;
      // select first year immediately
      yearSelect.value = String(yearOptions[yearAnimIndex]);
      yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
      yearTimer = setInterval(() => {
        yearAnimIndex++;
        if (yearAnimIndex >= yearOptions.length) {
          stopYearAnimation();
          return;
        }
        yearSelect.value = String(yearOptions[yearAnimIndex]);
        yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }, 500);
    }
    if (playBtn) {
      playBtn.setAttribute('aria-pressed','false');
      playBtn.addEventListener('click', () => {
        if (isYearPlaying) stopYearAnimation(); else startYearAnimation();
      });
      // stop animation if user manually changes year
      yearSelect.addEventListener('change', () => { if (isYearPlaying && document.activeElement !== playBtn) stopYearAnimation(); });
    }
  }
  document.getElementById("typeFilter").addEventListener("change", applyFilters);
  document.getElementById("loaFilter").addEventListener("change", applyFilters);
  document.getElementById("regionFilter").addEventListener("change", applyFilters);
  
  
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
  // ensure active filters area is populated initially
  try { updateActiveFilters(); } catch (e) {}
}

// Update the area above the map that shows selected filter values
function updateActiveFilters() {
  const badge = document.getElementById('filterBadge');
  if (!badge) return;
  
  const filters = [
    { id: 'typeFilter' },
    { id: 'loaFilter' },
    { id: 'regionFilter' }
  ];

  let filterCount = 0;
  filters.forEach(f => {
    const sel = document.getElementById(f.id);
    if (!sel) return;
    const vals = Array.from(sel.selectedOptions).filter(o => o.value);
    filterCount += vals.length;
  });
  
  // Show/hide badge based on filter count
  if (filterCount > 0) {
    badge.textContent = filterCount;
    badge.classList.add('active');
  } else {
    badge.classList.remove('active');
  }
}

function applyFilters() {
  // unselect ciountry when filters change
  selectedCountryCode = null;

  const loaValues = Array.from(document.getElementById("loaFilter").selectedOptions).map(o => o.value).filter(Boolean).map(Number);
  const typeValues = Array.from(document.getElementById("typeFilter").selectedOptions).map(o => o.value).filter(Boolean).map(Number);
  const regionValues = Array.from(document.getElementById("regionFilter").selectedOptions).map(o => o.value).filter(Boolean);
  const yearEl = document.getElementById("yearFilter");
  const yearValue = yearEl && yearEl.value ? Number(yearEl.value) : null;

  filteredData = data.filter(item => {

    if (loaValues.length) {
      const itemLoas = (item.loa || []).map(Number);
      if (!itemLoas.some(l => loaValues.includes(l))) return false;
    }

    if (typeValues.length) {
      if (!typeValues.includes(item.type)) return false;
    }

    if (regionValues.length) {
      const itemHasRegion = item.countries?.some(code => {
        const meta = countryMeta[code.toLowerCase()];
        return meta && regionValues.includes(meta.region);
      });
      if (!itemHasRegion) return false;
    }

    if (yearValue !== null) {
      const y = yearMap[item.id];
      // exclude items without a known year or with year > selected
      if (y === undefined || y === null || y > yearValue) return false;
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
  const regionValues = Array.from(document.getElementById("regionFilter").selectedOptions).map(o => o.value).filter(Boolean);
  const set = new Set();
  filteredData.forEach(item => {
    item.countries?.forEach(code => {
      const meta = countryMeta[code.toLowerCase()];
      if (!regionValues.length || regionValues.includes(meta?.region)) {
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

  panel.innerHTML = `
    <div class="details-header">
      <div class="details-meta">
        <small>${countryRegion}</small>
        <h2 class="selected-country">${countryName}</h2>
      </div>
      <div class="details-count">
        <small>${items.length} digital identit${items.length > 1 ? "ies" : "y"} available</small>
      </div>
    </div>
    <hr/>
  `;

  if (!items.length) {
    panel.innerHTML += "<p class=\"small\">No matching identities for current filters.</p>";
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
          <strong>Year of first issuance:</strong> ${yearMap[item.id] ?? '-'}<br/>
          <strong>Flows:</strong> ${item.flowTypes?.join(", ") || "-"}<br/>
          <strong>Scopes:</strong> <ul style="margin-block-start:0.25em"><li>${item.scopes?.join("</li><li>") || "-"}</li></ul>
        </small>
      </div>
    `;
  });
}

// ----------------------------
// List view rendering
// ----------------------------
function renderListView() {
  const regionValues = Array.from(document.getElementById("regionFilter").selectedOptions).map(o => o.value).filter(Boolean);
  const listEl = document.getElementById('list');
  if (!listEl) return;

  // Build per-country aggregation from filteredData
  const countryMap = {}; // key: iso2 lower
  filteredData.forEach(item => {
    (item.countries || []).forEach(code => {
      const k = code.toLowerCase();
      const meta = countryMeta[k];
      if (!regionValues.length || regionValues.includes(meta?.region)) {
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

      html += `<a href="#" class="country-link small" data-code="${c.code}" data-name="${c.name}" data-region="${c.region}">${c.name}</a>${typeIcons}<br/>`;
    });
    html += `</section>`;
  });

  if (!html) html = '<div class="small" style="padding:18px">No countries match current filters.</div>';
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

// ----------------------------
// Bottom sheet toggle (responsive)
// ----------------------------
function initDetailsBottomSheet() {
  const details = document.getElementById('details');
  if (!details) return;

  const mq = window.matchMedia('(max-width: 1200px)');
  const onClick = (e) => {
    if (!mq.matches) return;
    details.classList.toggle('expanded');
  };

  const applyState = () => {
    if (mq.matches) {
      details.classList.remove('expanded');
      details.addEventListener('click', onClick);
    } else {
      details.classList.remove('expanded');
      details.removeEventListener('click', onClick);
    }
  };

  applyState();
  mq.addEventListener('change', applyState);
}

document.addEventListener('DOMContentLoaded', initDetailsBottomSheet);

// ----------------------------
// Responsive filters toggle (<=1200px)
// ----------------------------
function initResponsiveFiltersToggle() {
  const topbar = document.querySelector('.topbar');
  const toggle = document.getElementById('filtersToggle');
  if (!topbar || !toggle) return;

  const mq = window.matchMedia('(max-width: 1200px)');
  const applyState = () => {
    if (!mq.matches) {
      topbar.classList.remove('filters-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  };

  toggle.addEventListener('click', () => {
    if (!mq.matches) return;
    const isOpen = topbar.classList.toggle('filters-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  applyState();
  mq.addEventListener('change', applyState);
}

document.addEventListener('DOMContentLoaded', initResponsiveFiltersToggle);
