'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  settleSources,
  hasSectionData,
  hasSectionFailures,
  failedSourceNames,
  sectionLabel,
  shouldShowFullScreenError,
} = require('./analyticsLoadUtils');

function settled(value) {
  return { status: 'fulfilled', value };
}

function rejected(reason) {
  return { status: 'rejected', reason: reason || new Error('boom') };
}

const BILL_404 = new Error('HTTP 404 for /billing/bills');

// Regression test for the reported Phase 3.1 failure: GET /billing/bills 404s
// on the live backend while reviews + inventory load fine. The OLD code used
// Promise.all, so this single rejection blanked the whole screen.
test('a failed bills request no longer blanks sections that loaded successfully', () => {
  const sources = settleSources([
    rejected(BILL_404),
    settled([{ _id: 'fb1', rating: 5 }]),
    settled([]),
    settled([{ _id: 'ing1', name: 'Tomato' }]),
  ]);

  assert.equal(sources.bills.ok, false);
  assert.equal(sources.bills.value, null, 'failed source never yields a value');
  assert.equal(sources.bills.error, BILL_404);

  assert.equal(sources.feedbacks.ok, true);
  assert.equal(sources.movements.ok, true);
  assert.equal(sources.ingredients.ok, true);

  assert.equal(hasSectionData(sources), true, 'other sections still have data to render');
  assert.equal(
    shouldShowFullScreenError(sources, false),
    false,
    'must NOT show the full-screen error when any section has data',
  );
  assert.deepEqual(failedSourceNames(sources), ['bills']);
  assert.equal(sectionLabel('bills'), 'Bill analytics');
});

test('full-screen error only when every source failed after loading finished', () => {
  const allFailed = settleSources([
    rejected(BILL_404),
    rejected(new Error('HTTP 500')),
    rejected(new Error('net::ERR_CONNECTION_REFUSED')),
    rejected(new Error('net::ERR_CONNECTION_REFUSED')),
  ]);

  assert.equal(hasSectionData(allFailed), false);
  assert.equal(hasSectionFailures(allFailed), true);
  assert.equal(shouldShowFullScreenError(allFailed, false), true);
  assert.equal(
    shouldShowFullScreenError(allFailed, true),
    false,
    'never flash a full-screen error while still loading',
  );
  assert.deepEqual(
    failedSourceNames(allFailed),
    ['bills', 'feedbacks', 'movements', 'ingredients'],
  );
});

test('all sources succeeding yields no failures and no full-screen error', () => {
  const sources = settleSources([settled([]), settled([]), settled([]), settled([])]);

  assert.equal(hasSectionFailures(sources), false);
  assert.equal(hasSectionData(sources), true);
  assert.deepEqual(failedSourceNames(sources), []);
  assert.equal(shouldShowFullScreenError(sources, false), false);
});

test('missing or malformed settled entries are treated as failures, never values', () => {
  const sources = settleSources([undefined, null, settled([]), settled([])]);

  assert.equal(sources.bills.ok, false);
  assert.equal(sources.bills.value, null);
  assert.equal(sources.feedbacks.ok, false);
  assert.equal(hasSectionData(sources), true);
  assert.deepEqual(failedSourceNames(sources), ['bills', 'feedbacks']);
});

test('sectionLabel has a readable label for every source', () => {
  assert.equal(sectionLabel('feedbacks'), 'Reviews');
  assert.equal(sectionLabel('movements'), 'Inventory activity');
  assert.equal(sectionLabel('ingredients'), 'Stock items');
  assert.equal(sectionLabel('unknown-source'), 'unknown-source');
});