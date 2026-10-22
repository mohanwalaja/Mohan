import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '../../src/context/AuthContext';
import { CartProvider, useCart } from '../../src/context/CartContext';
import { SingleServiceCheckoutModal } from '../../src/components/cart/SingleServiceCheckoutModal';
import { UnifiedCheckoutModal } from '../../src/components/cart/UnifiedCheckoutModal';
import type { ServiceType } from '../../src/types';

interface HarnessProps {
  serviceType: ServiceType;
  family: boolean;
}

const baseBirth = {
  dob: '1992-05-15',
  tob: '06:30',
  birthPlace: 'Chennai, Tamil Nadu, India',
  country: 'India',
  latitude: 13.0827,
  longitude: 80.2707,
  timezoneOffsetHours: 5.5
};

function completeCheckoutPayload(serviceType: ServiceType) {
  if (serviceType === 'MARRIAGE_COMPATIBILITY') {
    return {
      name: 'Checkout Test',
      country: 'India',
      bride: { name: 'Bride Test', ...baseBirth },
      groom: { name: 'Groom Test', ...baseBirth, dob: '1990-08-20', tob: '10:15' }
    };
  }
  if (serviceType === 'MUHURTHAM') {
    return {
      name: 'Checkout Test',
      ...baseBirth,
      eventKey: 'wedding',
      muhurthamPlace: 'Chennai, Tamil Nadu, India',
      muhurthamLatitude: 13.0827,
      muhurthamLongitude: 80.2707,
      muhurthamTimezoneOffsetHours: 5.5
    };
  }
  return { name: 'Checkout Test', ...baseBirth };
}

function CheckoutHarness({ serviceType, family }: HarnessProps) {
  const { isLoading } = useAuth();
  const { settings, openCheckout, addItem } = useCart();
  const ready = !isLoading && !!settings;
  useEffect(() => {
    if (ready && family) openCheckout();
  }, [ready, family]);

  if (!ready) return <p>Loading checkout…</p>;
  if (family) return (
    <>
      <button
        data-testid="add-next-family-checkout"
        onClick={() => {
          addItem({
            serviceType: 'BIRTH_JATHAGAM',
            language: 'en',
            devoteeName: 'Follow-up Order',
            summaryText: 'Follow-up test chart',
            country: 'India',
            inputPayload: { name: 'Follow-up Order', ...baseBirth },
            prices: { INR: 499, USD: 18 },
            unitPrice: 499,
            currency: 'INR'
          });
          openCheckout();
        }}
      >
        Prepare next checkout
      </button>
      <UnifiedCheckoutModal />
    </>
  );
  return (
    <SingleServiceCheckoutModal
      isOpen
      onClose={() => {}}
      serviceType={serviceType}
      serviceTitle={serviceType.replace(/_/g, ' ')}
      devoteeSummary={{ name: 'Checkout Test' }}
      selectedLanguage="en"
      inputPayload={completeCheckoutPayload(serviceType)}
    />
  );
}

// Uses the real auth and cart providers; tests only mock HTTP responses. This
// catches role mismatches and payment controls that a pure pricing test misses.
export function mountCheckout(props: HarnessProps) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  createRoot(container).render(
    <AuthProvider>
      <CartProvider>
        <CheckoutHarness {...props} />
      </CartProvider>
    </AuthProvider>
  );
}
