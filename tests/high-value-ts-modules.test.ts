import assert from 'node:assert/strict';
import {
  MAX_FAMILY_ORDER_ITEMS,
  hasFamilyOrderCapacity
} from '../src/services/familyOrderLimits';
import {
  ROUTE_CANONICAL_PATHS,
  routeHref,
  shouldRouteInApp,
  type LinkClickLike
} from '../src/services/routePaths';
import {
  getServicePrices,
  resolveOrderCurrency,
  usdToInr
} from '../src/services/pricing';
import {
  canonicalCalculationPayload,
  familyMemberDisplayName,
  getFamilyGroupId
} from '../src/services/orderPayload';
import {
  buildPeoplePayload,
  groupCartItemsIntoPeople,
  multiPersonTotals,
  validatePeople,
  type PersonDraft
} from '../src/services/multiPersonOrder';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

console.log('--- DIRECT DETERMINISTIC TS MODULE CONTRACTS ---');

check('family checkout accepts only integer item counts below the shared ceiling', () => {
  assert.equal(MAX_FAMILY_ORDER_ITEMS, 6);
  for (let count = 0; count < MAX_FAMILY_ORDER_ITEMS; count += 1) {
    assert.equal(hasFamilyOrderCapacity(count), true, `${count} reports leave room for another`);
  }
  for (const count of [-1, 6, 7, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(hasFamilyOrderCapacity(count), false, `${String(count)} is not available capacity`);
  }
});

check('route paths are canonical and only ordinary primary clicks enter the SPA router', () => {
  assert.equal(routeHref('policy-privacy'), '/privacy-policy');
  assert.equal(routeHref(' POLICY-TERMS '), '/terms');
  assert.equal(routeHref('birth-jathagam'), '/birth-jathagam');
  assert.equal(routeHref(''), '/');
  assert.equal(ROUTE_CANONICAL_PATHS['admin-portal'], '/admin');

  const click: LinkClickLike = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false
  };
  assert.equal(shouldRouteInApp(click), true);
  assert.equal(shouldRouteInApp({ ...click, ctrlKey: true }), false);
  assert.equal(shouldRouteInApp({ ...click, metaKey: true }), false);
  assert.equal(shouldRouteInApp({ ...click, button: 1 }), false);
  assert.equal(shouldRouteInApp(click, '_blank'), false);
  assert.equal(shouldRouteInApp({ ...click, defaultPrevented: true }), false);
});

check('pricing keeps INR derived from USD and a real payment method wins currency selection', () => {
  const settings = {
    servicePricing: {
      BIRTH_JATHAGAM: { usd: 10, inr: 1 },
      BABY_NAMING: { USD: 5, INR: 1 }
    }
  };
  assert.deepEqual(getServicePrices(settings, 'BIRTH_JATHAGAM'), { INR: usdToInr(10), USD: 10 });
  assert.deepEqual(getServicePrices(settings, 'BABY_NAMING'), { INR: usdToInr(5), USD: 5 });
  assert.equal(usdToInr(9.99), Math.round(9.99 * 84));
  assert.equal(resolveOrderCurrency({ paymentMethod: 'PAYPAL', billingCountry: 'India' }), 'USD');
  assert.equal(resolveOrderCurrency({ paymentMethod: 'UPI', billingCountry: 'USA' }), 'INR');
});

check('saved calculation payloads are canonicalized without mutating the order copy', () => {
  const saved = {
    dob: '2000-7-1',
    tob: '6:30 PM',
    partner: { dob: '1999-2-3', tob: '6:05 am' }
  };
  const canonical = canonicalCalculationPayload(saved);
  assert.deepEqual(canonical, {
    dob: '2000-07-01',
    tob: '18:30',
    partner: { dob: '1999-02-03', tob: '06:05' }
  });
  assert.deepEqual(saved, {
    dob: '2000-7-1',
    tob: '6:30 PM',
    partner: { dob: '1999-2-3', tob: '6:05 am' }
  });

  const wedding = {
    serviceType: 'MARRIAGE_COMPATIBILITY',
    orderNumber: 'ORD-42',
    groupId: 'FAMILY-9',
    inputPayload: { bride: { name: 'Asha' }, groom: { name: 'Dev' } }
  } as any;
  assert.equal(familyMemberDisplayName(wedding), 'Asha & Dev');
  assert.equal(getFamilyGroupId([wedding]), 'FAMILY-9');
  assert.equal(getFamilyGroupId([], 'EXPLICIT'), 'EXPLICIT');
});

const asha: PersonDraft = {
  key: 'person-1',
  name: '  Asha   Patel ',
  gender: 'F',
  dob: '2000-01-02',
  tob: '06:30',
  place: 'Suva',
  country: '',
  latitude: -18.1416,
  longitude: 178.4419,
  timezoneOffsetHours: 12,
  timeZoneId: 'Pacific/Fiji',
  services: ['BIRTH_JATHAGAM', 'BABY_NAMING'],
  language: 'en'
};
const familySettings = {
  servicePricing: {
    BIRTH_JATHAGAM: { usd: 10 },
    BABY_NAMING: { usd: 5 }
  }
} as any;

check('multi-person checkout groups, validates, prices and builds its API payload deterministically', () => {
  const people = [asha, { ...asha, key: 'person-2', name: 'Ravi', services: ['BIRTH_JATHAGAM'] as PersonDraft['services'] }];
  assert.deepEqual(validatePeople(people), { ok: true, errors: [], itemCount: 3 });

  const invalid = validatePeople([{ ...asha, services: [], latitude: null }]);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.itemCount, 0);
  assert.ok(invalid.errors.some(error => error.includes('select it from search, map or GPS')));
  assert.ok(invalid.errors.some(error => error.includes('Choose at least one service')));

  assert.deepEqual(multiPersonTotals(people, familySettings, 'USD', true), {
    currency: 'USD',
    lineTotals: [0, 5, 10],
    total: 15,
    itemCount: 3,
    freeFirstReport: true
  });

  const payload = buildPeoplePayload([asha]);
  assert.equal(payload[0].name, 'Asha Patel');
  assert.deepEqual(payload[0].services, ['BIRTH_JATHAGAM', 'BABY_NAMING']);
  assert.notEqual(payload[0].services, asha.services, 'API payload owns its service list');

  const grouped = groupCartItemsIntoPeople([
    {
      serviceType: 'BIRTH_JATHAGAM',
      language: 'en',
      inputPayload: { name: 'Asha Patel', dob: '2000-01-02', tob: '06:30', birthPlace: 'Suva' }
    },
    {
      serviceType: 'BABY_NAMING',
      language: 'en',
      inputPayload: { name: 'Asha Patel', dob: '2000-01-02', tob: '06:30', birthPlace: 'Suva' }
    }
  ] as any);
  assert.equal(grouped.length, 1);
  assert.deepEqual(grouped[0].services, ['BIRTH_JATHAGAM', 'BABY_NAMING']);
});

console.log(`\nDirect TS module contracts passed (${passed} checks across five modules).`);
