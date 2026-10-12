'use strict';

// Phase 3.1: per-source load classification for the Reviews & Analytics screen.
//
// Bills, reviews, movements and ingredients are four INDEPENDENT API sources.
// The reported Phase 3 bug was that a single failing request (GET /billing/bills
// returning 404 on a backend that had not been re-deployed) rejected a
// Promise.all and blanked the ENTIRE screen ("Could not load data"), even though
// the other three sources had loaded fine.
//
// This module is pure (CommonJS, no React Native imports) so the fix is unit
// testable with Node's test runner, matching the project's other utils.

// Stable source order = Promise.allSettled call order in the screen.
const ANALYTICS_SOURCES = ['bills', 'feedbacks', 'movements', 'ingredients'];

// Human labels used in error messages / the refresh banner.
const SECTION_LABELS = {
  bills: 'Bill analytics',
  feedbacks: 'Reviews',
  movements: 'Inventory activity',
  ingredients: 'Stock items',
};

function sectionLabel(name) {
  return SECTION_LABELS[name] || name;
}

// Normalise Product.allSettled results (length 4, in ANALYTICS_SOURCES order)
// into { name: { ok, error, value } }. Rejected/absent entries keep value null
// so callers can NEVER mistake a failed request for a successful empty result.
function settleSources(results) {
  const sources = {};
  ANALYTICS_SOURCES.forEach(function (name, index) {
    const entry = results && results[index];
    if (entry && entry.status === 'fulfilled') {
      sources[name] = { ok: true, error: null, value: entry.value };
    } else if (entry && entry.status === 'rejected') {
      sources[name] = { ok: false, error: entry.reason, value: null };
    } else {
      sources[name] = { ok: false, error: new Error('No result for ' + name), value: null };
    }
  });
  return sources;
}

function hasSectionData(sources) {
  return ANALYTICS_SOURCES.some(function (name) {
    return sources && sources[name] && sources[name].ok;
  });
}

function hasSectionFailures(sources) {
  return ANALYTICS_SOURCES.some(function (name) {
    return sources && sources[name] && !sources[name].ok;
  });
}

// Names of the sources that failed (in stable order), for section-level errors.
function failedSourceNames(sources) {
  return ANALYTICS_SOURCES.filter(function (name) {
    return sources && sources[name] && !sources[name].ok;
  });
}

// Full-screen error only when every source failed AND loading has finished.
// If any one source produced data, the screen renders that data and honours the
// remaining failures as per-section errors instead of blanking everything.
function shouldShowFullScreenError(sources, loading) {
  if (loading) {
    return false;
  }
  return !hasSectionData(sources) && hasSectionFailures(sources);
}

module.exports = {
  ANALYTICS_SOURCES: ANALYTICS_SOURCES,
  SECTION_LABELS: SECTION_LABELS,
  sectionLabel: sectionLabel,
  settleSources: settleSources,
  hasSectionData: hasSectionData,
  hasSectionFailures: hasSectionFailures,
  failedSourceNames: failedSourceNames,
  shouldShowFullScreenError: shouldShowFullScreenError,
};