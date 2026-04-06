/**
 * Filters component — renders filter controls and notifies on change.
 */

const DOMAINS = ['Fury', 'Calm', 'Mind', 'Body', 'Chaos', 'Order'];

export const BANNED_CARDS = new Set([
  'Called Shot',
  'Draven - Vanquisher',
  'Fight or Flight',
  'Scrapheap',
  'The Dreaming Tree',
  'Obelisk of Power',
  "Reaver's Row",
]);
const ENERGY_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // 8 means 8+
const DECK_TABS = ['All', 'Legend', 'Main Deck', 'Battlefield', 'Rune'];

const SORT_OPTIONS = [
  { value: 'collector', label: 'Set / Collector #' },
  { value: 'name', label: 'Name' },
  { value: 'energy', label: 'Energy Cost' },
  { value: 'rarity', label: 'Rarity' },
];

const RARITY_ORDER = { 'Common': 0, 'Uncommon': 1, 'Rare': 2, 'Epic': 3, 'Showcase': 4 };

const TAB_LOCKED_TYPE = {
  'Legend': 'Legend',
  'Battlefield': 'Battlefield',
  'Rune': 'Rune',
};

export function createFilterState() {
  return {
    search: '',
    domains: new Set(),
    types: new Set(),
    supertypes: new Set(),
    sets: new Set(),
    rarities: new Set(),
    energy: new Set(),
    sort: 'collector',
    sortDir: 'asc',
    tab: 'All',
    hideBanned: true,
  };
}

export function renderFilters(container, filterState, indexes, sets, onChange, onChangeHard) {
  container.innerHTML = '';

  // Row 1: Tabs + search
  const row1 = el('div', 'filter-row');

  const tabs = el('div', 'tab-toggles');
  for (const tab of DECK_TABS) {
    const btn = el('button', `tab-btn${filterState.tab === tab ? ' active' : ''}`);
    btn.textContent = tab;
    btn.addEventListener('click', () => {
      filterState.tab = tab;
      const locked = TAB_LOCKED_TYPE[tab];
      filterState.types = locked ? new Set([locked]) : new Set();
      onChangeHard();
    });
    tabs.appendChild(btn);
  }
  row1.appendChild(tabs);

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'filter-search';
  searchInput.placeholder = 'Search cards by name or text...';
  searchInput.value = filterState.search;
  searchInput.addEventListener('input', () => {
    filterState.search = searchInput.value;
    onChange();
  });
  row1.appendChild(searchInput);
  container.appendChild(row1);

  // Row 2: Domains + energy cost
  const row2 = el('div', 'filter-row');

  const domainLabel = el('span', 'filter-label');
  domainLabel.textContent = 'Domain';
  row2.appendChild(domainLabel);

  const domainToggles = el('div', 'domain-toggles');
  for (const domain of DOMAINS) {
    const btn = el('button', `domain-btn${filterState.domains.has(domain) ? ' active' : ''}`);
    btn.dataset.domain = domain;
    btn.textContent = domain.charAt(0);
    btn.title = domain;
    btn.addEventListener('click', () => {
      if (filterState.domains.has(domain)) {
        filterState.domains.delete(domain);
      } else {
        filterState.domains.add(domain);
      }
      onChangeHard();
    });
    domainToggles.appendChild(btn);
  }
  row2.appendChild(domainToggles);

  const energyLabel = el('span', 'filter-label');
  energyLabel.textContent = 'Energy';
  row2.appendChild(energyLabel);

  const energyToggles = el('div', 'energy-toggles');
  for (const val of ENERGY_VALUES) {
    const label = val === 8 ? '8+' : String(val);
    const btn = el('button', `energy-btn${filterState.energy.has(val) ? ' active' : ''}`);
    btn.textContent = label;
    btn.addEventListener('click', () => {
      if (filterState.energy.has(val)) {
        filterState.energy.delete(val);
      } else {
        filterState.energy.add(val);
      }
      onChangeHard();
    });
    energyToggles.appendChild(btn);
  }
  row2.appendChild(energyToggles);

  container.appendChild(row2);

  // Row 3: Filter dropdowns
  const row3 = el('div', 'filter-row');

  const filterLabel = el('span', 'filter-label');
  filterLabel.textContent = 'Filter';
  row3.appendChild(filterLabel);

  const lockedType = TAB_LOCKED_TYPE[filterState.tab];
  if (lockedType) {
    filterState.types = new Set([lockedType]);
  }
  const typeOptions = lockedType ? [lockedType] : (indexes.cardTypes ?? []);
  row3.appendChild(makeMultiSelect('All Types', filterState.types, typeOptions, onChange, lockedType != null));

  row3.appendChild(makeMultiSelect('All Supertypes', filterState.supertypes, indexes.cardSupertypes ?? [], onChange));

  const setOptions = (Array.isArray(sets) ? sets : []).map((s) => s.name ?? s.set_id);
  row3.appendChild(makeMultiSelect('All Sets', filterState.sets, setOptions, onChange));

  row3.appendChild(makeMultiSelect('All Rarities', filterState.rarities, indexes.rarities ?? [], onChange));

  container.appendChild(row3);

  // Row 4: Sort options
  const row4 = el('div', 'filter-row');

  const sortLabel = el('span', 'filter-label');
  sortLabel.textContent = 'Sort';
  row4.appendChild(sortLabel);

  // Sort selector
  const sortSelect = document.createElement('select');
  sortSelect.className = 'filter-select';
  sortSelect.title = 'Sort by';
  for (const opt of SORT_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === filterState.sort) o.selected = true;
    sortSelect.appendChild(o);
  }
  sortSelect.addEventListener('change', () => {
    filterState.sort = sortSelect.value;
    onChangeHard();
  });
  row4.appendChild(sortSelect);

  // Sort direction toggle
  const dirBtn = el('button', 'sort-dir-btn');
  dirBtn.textContent = filterState.sortDir === 'asc' ? '▲' : '▼';
  dirBtn.title = filterState.sortDir === 'asc' ? 'Ascending (click to reverse)' : 'Descending (click to reverse)';
  dirBtn.addEventListener('click', () => {
    filterState.sortDir = filterState.sortDir === 'asc' ? 'desc' : 'asc';
    onChangeHard();
  });
  row4.appendChild(dirBtn);

  container.appendChild(row4);

  // Row 5: Banned cards toggle
  const row5 = el('div', 'filter-row');

  const bannedLabel = document.createElement('label');
  bannedLabel.className = 'filter-toggle-label';
  const bannedCheckbox = document.createElement('input');
  bannedCheckbox.type = 'checkbox';
  bannedCheckbox.checked = filterState.hideBanned;
  bannedCheckbox.addEventListener('change', () => {
    filterState.hideBanned = bannedCheckbox.checked;
    onChange();
  });
  bannedLabel.appendChild(bannedCheckbox);
  const bannedText = document.createElement('span');
  bannedText.textContent = ' Hide cards banned from Standard Constructed';
  bannedLabel.appendChild(bannedText);
  row5.appendChild(bannedLabel);

  const resetBtn = el('button', 'filter-reset-btn');
  resetBtn.textContent = 'Reset Filters';
  resetBtn.addEventListener('click', () => {
    const defaults = createFilterState();
    Object.assign(filterState, defaults);
    filterState.domains = defaults.domains;
    filterState.energy = defaults.energy;
    filterState.types = defaults.types;
    filterState.supertypes = defaults.supertypes;
    filterState.sets = defaults.sets;
    filterState.rarities = defaults.rarities;
    onChangeHard();
  });
  row5.appendChild(resetBtn);

  container.appendChild(row5);
}

/**
 * Apply the current filter state to a list of cards, returning matching cards.
 */
export function applyFilters(cards, filterState, sets) {
  const search = filterState.search.toLowerCase().trim();

  return cards.filter((card) => {
    // Tab filter
    if (filterState.tab !== 'All') {
      const type = card.classification?.type?.toLowerCase() ?? '';
      const supertype = card.classification?.supertype?.toLowerCase() ?? '';

      switch (filterState.tab) {
        case 'Legend':
          if (type !== 'legend') return false;
          break;
        case 'Main Deck':
          if (type === 'legend' || type === 'battlefield' || type === 'rune') return false;
          break;
        case 'Battlefield':
          if (type !== 'battlefield') return false;
          break;
        case 'Rune':
          if (type !== 'rune') return false;
          break;
      }
    }

    // Search
    if (search) {
      const name = (card.name ?? '').toLowerCase();
      const text = (card.text?.plain ?? '').toLowerCase();
      if (!name.includes(search) && !text.includes(search)) return false;
    }

    // Domain filter
    if (filterState.domains.size > 0) {
      const cardDomains = card.classification?.domain ?? [];
      const matched = cardDomains.some((d) => filterState.domains.has(d));
      if (!matched) return false;
    }

    // Type filter
    if (filterState.types.size > 0) {
      if (!filterState.types.has(card.classification?.type ?? '')) return false;
    }

    // Supertype filter
    if (filterState.supertypes.size > 0) {
      if (!filterState.supertypes.has(card.classification?.supertype ?? '')) return false;
    }

    // Set filter
    if (filterState.sets.size > 0) {
      const setLabel = card.set?.label ?? card.set?.set_id ?? '';
      if (!filterState.sets.has(setLabel)) return false;
    }

    // Rarity filter
    if (filterState.rarities.size > 0) {
      if (!filterState.rarities.has(card.classification?.rarity ?? '')) return false;
    }

    // Banned filter
    if (filterState.hideBanned && BANNED_CARDS.has(card.name)) {
      return false;
    }

    // Energy cost filter
    if (filterState.energy.size > 0) {
      const cost = card.attributes?.energy;
      const match = filterState.energy.has(8)
        ? (cost != null && cost >= 8) || filterState.energy.has(cost)
        : filterState.energy.has(cost);
      if (!match) return false;
    }

    return true;
  });
}

// ---- URL serialization ----

export function filterStateToParams(state) {
  const params = new URLSearchParams();
  if (state.tab !== 'All') params.set('tab', state.tab);
  if (state.search) params.set('q', state.search);
  if (state.domains.size > 0) params.set('domains', [...state.domains].join(','));
  if (state.types.size > 0) params.set('types', [...state.types].join(','));
  if (state.supertypes.size > 0) params.set('supertypes', [...state.supertypes].join(','));
  if (state.sets.size > 0) params.set('sets', [...state.sets].join(','));
  if (state.rarities.size > 0) params.set('rarities', [...state.rarities].join(','));
  if (state.energy !== null) params.set('energy', String(state.energy));
  if (state.sort !== 'collector') params.set('sort', state.sort);
  if (state.sortDir !== 'asc') params.set('dir', state.sortDir);
  if (state.hideBanned) params.set('hideBanned', '1');
  return params;
}

export function filterStateFromParams(state, params) {
  if (params.has('tab')) state.tab = params.get('tab');
  if (params.has('q')) state.search = params.get('q');
  if (params.has('domains')) {
    state.domains = new Set(params.get('domains').split(',').filter(Boolean));
  }
  if (params.has('types')) state.types = new Set(params.get('types').split(',').filter(Boolean));
  if (params.has('supertypes')) state.supertypes = new Set(params.get('supertypes').split(',').filter(Boolean));
  if (params.has('sets')) state.sets = new Set(params.get('sets').split(',').filter(Boolean));
  if (params.has('rarities')) state.rarities = new Set(params.get('rarities').split(',').filter(Boolean));
  if (params.has('energy')) state.energy = parseInt(params.get('energy'), 10);
  if (params.has('sort')) state.sort = params.get('sort');
  if (params.has('dir')) state.sortDir = params.get('dir');
  if (params.has('hideBanned')) state.hideBanned = params.get('hideBanned') === '1';
}

// ---- Sorting ----

export function sortCards(cards, sortKey, sortDir = 'asc') {
  const sorted = [...cards];
  switch (sortKey) {
    case 'name':
      sorted.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
      break;
    case 'energy':
      sorted.sort((a, b) => {
        const ea = a.attributes?.energy ?? 999;
        const eb = b.attributes?.energy ?? 999;
        if (ea !== eb) return ea - eb;
        return (a.name ?? '').localeCompare(b.name ?? '');
      });
      break;
    case 'rarity':
      sorted.sort((a, b) => {
        const ra = RARITY_ORDER[a.classification?.rarity] ?? 99;
        const rb = RARITY_ORDER[b.classification?.rarity] ?? 99;
        if (ra !== rb) return ra - rb;
        return (a.name ?? '').localeCompare(b.name ?? '');
      });
      break;
    case 'collector':
    default:
      sorted.sort((a, b) => {
        const sa = a.set?.set_id ?? '';
        const sb = b.set?.set_id ?? '';
        if (sa !== sb) return sa.localeCompare(sb);
        return (a.collector_number ?? 0) - (b.collector_number ?? 0);
      });
      break;
  }
  if (sortDir === 'desc') sorted.reverse();
  return sorted;
}

// ---- Helpers ----

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function makeSelect(label, currentValue, options, onChange) {
  const select = document.createElement('select');
  select.className = 'filter-select';
  select.title = label;

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = label;
  select.appendChild(defaultOpt);

  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    if (opt === currentValue) o.selected = true;
    select.appendChild(o);
  }

  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function makeMultiSelect(label, selectedSet, options, onChange, disabled = false) {
  const wrapper = el('div', 'multiselect');

  const btn = el('button', 'multiselect-btn');
  btn.title = label;
  if (disabled) btn.disabled = true;

  function updateBtnText() {
    if (selectedSet.size === 0) {
      btn.textContent = label;
      btn.classList.remove('has-selection');
    } else {
      btn.textContent = [...selectedSet].join(', ');
      btn.classList.add('has-selection');
    }
  }
  updateBtnText();

  const dropdown = el('div', 'multiselect-dropdown');
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  for (const opt of options) {
    const item = el('label', 'multiselect-item');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedSet.has(opt);
    if (disabled) cb.disabled = true;
    cb.addEventListener('change', () => {
      if (cb.checked) {
        selectedSet.add(opt);
      } else {
        selectedSet.delete(opt);
      }
      updateBtnText();
      onChange();
    });
    item.appendChild(cb);
    const text = document.createTextNode(` ${opt}`);
    item.appendChild(text);
    dropdown.appendChild(item);
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Close other open dropdowns
    document.querySelectorAll('.multiselect.open').forEach((ms) => {
      if (ms !== wrapper) ms.classList.remove('open');
    });
    wrapper.classList.toggle('open');
  });

  wrapper.appendChild(btn);
  wrapper.appendChild(dropdown);

  return wrapper;
}

// Close multiselect dropdowns when clicking outside
document.addEventListener('click', () => {
  document.querySelectorAll('.multiselect.open').forEach((ms) => ms.classList.remove('open'));
});
