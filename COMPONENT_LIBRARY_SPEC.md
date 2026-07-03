# 📋 Component Library Specification

## @locnative/react-ui & @locnative/vue-ui

### Executive Summary

Locnative should publish framework-specific UI component libraries for React and Vue that provide production-ready, accessible, customizable components for all SDK features. These libraries bridge the gap between raw API data and intuitive user interfaces, dramatically improving developer experience.

**Target:** Developers building checkout flows, address forms, location-based features in public-facing applications.

---

## 1. Goals & Objectives

- ✅ Reduce time-to-market for address autocomplete & location features
- ✅ Provide accessible, mobile-first components (WCAG 2.1 AA)
- ✅ Allow extensive customization via CSS variables, className composition, and slot-based rendering
- ✅ Support both React and Vue with framework-appropriate APIs
- ✅ Keep bundle size lean (<50KB gzipped per framework)
- ✅ Integrate seamlessly with TanStack Form (framework-agnostic)
- ✅ Provide geolocation-aware proximity boosting out-of-the-box
- ✅ Full async validation capabilities

---

## 2. Project Structure

### Separate NPM Packages (Independent Versioning)

```
@locnative/react-ui@1.0.0
├── Address components (React)
├── Routing components (React)
├── Region/Zone components (React)
└── Shared utilities & types

@locnative/vue-ui@1.0.0
├── Address components (Vue 3)
├── Routing components (Vue 3)
├── Region/Zone components (Vue 3)
└── Shared utilities & types
```

**Rationale:** Independent release cycles, framework-optimized APIs, easier maintenance.

---

## 3. Component Library Architecture

### Tier 1: Composable Building Blocks (Headless + Styled)

#### React Components
```
AddressAutocomplete
├── Props: value, onChange, onSelect, className, slots
├── Supports: TanStack Form integration, custom renderers
└── Returns: Full address object + parsed fields

ReverseGeocodeInput
├── Props: latitude, longitude, onResult
└── Returns: Address + distance

ForwardGeocodeInput
├── Props: query, onResult
└── Returns: Coordinates + address details

RegionClassifier
├── Props: latitude, longitude, layers
└── Returns: ABS region classification

RoutingWidget
├── Props: fromAddress, toAddress, profile
└── Returns: Directions + distance/duration
```

#### Vue 3 Components
Same API, Vue-idiomatic patterns.

### Tier 2: Higher-Level Composed Components

**AddressFormField** (React & Vue)
- Handles: Input + error states + auto-population
- Props: label, required, error, value, onChange
- Integrates: TanStack Form validation

**AddressFieldGroup** (React & Vue)
- Composable: Street, Suburb, State, Postcode fields
- Auto-population: When one field changes, related fields update
- Validation: Async validation (address exists, valid postcode, etc.)

**LocationPicker** (React & Vue)
- Map + autocomplete integrated
- Geolocation support
- Proximity-boosted suggestions

### Tier 3: Form Integration Helpers

**useAddressAutocomplete** (React Hook)
- Handles: Session tokens, debouncing, caching
- Returns: suggestions, loading, error, select()
- Integrates: TanStack Form useField()

**useAddressGeolocation** (React Hook)
- Detects: User location with permission handling
- Returns: lat/lng for proximity boosting

**\<AddressAutocompleteField\>** (Vue Composable)
- Equivalent to React hook
- Returns: Reactive state object

---

## 4. Core Component: AddressAutocomplete

### Props Interface (React Example)

```typescript
interface AddressAutocompleteProps {
  // Value & Events
  value?: string;
  onQueryChange?: (query: string) => void;
  onSelect?: (address: AddressWithParsed) => void;

  // Form Integration
  error?: string;
  required?: boolean;
  disabled?: boolean;

  // Behavior
  debounceMs?: number;           // Default: 300ms
  minCharsToSearch?: number;     // Default: 2
  maxSuggestions?: number;       // Default: 5

  // Geolocation
  enableGeolocation?: boolean;   // Default: false
  userLat?: number;
  userLng?: number;
  proximityBoostRadius?: number; // Default: 50km

  // Session Token (Billing Optimization)
  sessionToken?: string;         // Developer-provided

  // Customization
  className?: string;            // Override root container
  placeholder?: string;

  // Slots (Render Props)
  renderSuggestion?: (item: AddressSuggestion, index: number) => React.ReactNode;
  renderEmpty?: () => React.ReactNode;
  renderError?: (error: string) => React.ReactNode;
  renderLoading?: () => React.ReactNode;

  // i18n
  i18nStrings?: {
    noResults?: string;
    enterManually?: string;
    errorRetry?: string;
    geolocationError?: string;
  };

  // Validation
  validate?: (address: AddressWithParsed) => Promise<ValidationError | null>;
}

interface AddressWithParsed {
  // From API
  id: number;
  formattedAddress: string;
  latitude: number;
  longitude: number;

  // Auto-parsed for form population
  streetAddress: string;        // "29/14 Fleet Street"
  suburb: string;               // "Browns Plains"
  state: string;                // "QLD"
  postcode: string;             // "4118"
  country: string;              // "Australia"
}
```

### Usage Example (React + TanStack Form)

```tsx
import { AddressAutocomplete } from '@locnative/react-ui';
import { useField } from '@tanstack/react-form';

export function CheckoutForm() {
  const form = useForm();
  const addressField = form.getFieldInfo('address');

  return (
    <AddressAutocomplete
      value={addressField.value}
      onSelect={(address) => {
        // Auto-populate dependent fields
        form.setFieldValue('suburb', address.suburb);
        form.setFieldValue('state', address.state);
        form.setFieldValue('postcode', address.postcode);
      }}
      validate={async (address) => {
        // Async validation: check if address is valid in your system
        const exists = await checkAddressInDatabase(address.id);
        return exists ? null : { message: 'Address not in service area' };
      }}
      enableGeolocation={true}
      className="w-full"
      renderSuggestion={(item) => (
        <div className="flex justify-between">
          <span>{item.streetAddress}</span>
          <span className="text-gray-500">{item.locality}, {item.state}</span>
        </div>
      )}
    />
  );
}
```

---

## 5. Styling & Customization

### Default Style System

- **Framework:** Tailwind CSS + ShadCN/ui components
- **Theme variables:** 50+ CSS variables for colors, spacing, shadows
- **Pre-built themes:** Light (default) + Dark mode (auto-detect + manual)

### CSS Variables (Customizable)

```css
/* Colors */
--locnative-primary: #3b82f6;
--locnative-error: #ef4444;
--locnative-background: #ffffff;
--locnative-border: #e5e7eb;

/* Spacing */
--locnative-spacing-xs: 0.25rem;
--locnative-spacing-sm: 0.5rem;
--locnative-spacing-md: 1rem;

/* Typography */
--locnative-font-size-sm: 0.875rem;
--locnative-font-size-base: 1rem;

/* Shadows & Borders */
--locnative-shadow: 0 1px 3px rgba(0,0,0,0.1);
--locnative-border-radius: 0.5rem;
```

### Customization Methods

**Method 1: CSS Variables (Easiest)**
```css
:root {
  --locnative-primary: #10b981;
  --locnative-border-radius: 0.25rem;
}
```

**Method 2: className Composition**
```tsx
<AddressAutocomplete
  className="my-custom-autocomplete"
  classNameInput="border-2 border-blue-500"
  classNameDropdown="shadow-lg"
/>
```

**Method 3: Slot-Based Composition (Most Control)**
```tsx
<AddressAutocomplete
  renderSuggestion={(item, index) => (
    <CustomSuggestionComponent address={item} isHighlighted={index === activeIndex} />
  )}
  renderError={(error) => (
    <div className="text-red-600 flex items-center">
      <AlertIcon /> {error}
    </div>
  )}
/>
```

**Dark Mode Support**
```tsx
// Automatic (respects system preference)
<AddressAutocomplete theme="auto" />

// Manual control
<AddressAutocomplete theme="dark" />

// Or via CSS class
<div className="dark">
  <AddressAutocomplete />
</div>
```

---

## 6. Accessibility (WCAG 2.1 AA)

### Requirements

- ✅ Keyboard navigation (Arrow Up/Down, Enter, Escape)
- ✅ ARIA labels & descriptions
- ✅ Screen reader announcements (live regions for suggestions)
- ✅ Focus management
- ✅ Color contrast (4.5:1 for text)
- ✅ Touch targets ≥44x44px on mobile
- ✅ Error announcements

### Keyboard Navigation

```
↓ Down arrow     → Highlights next suggestion
↑ Up arrow       → Highlights previous suggestion
Enter            → Selects highlighted suggestion
Escape           → Closes dropdown
Tab              → Moves to next form field
Shift+Tab        → Moves to previous form field
```

---

## 7. Mobile Experience

### Responsive Behavior

```
DESKTOP (>768px)
├── Dropdown overlay below input
├── Standard suggestion size
└── Max-height: 300px

TABLET (640px-768px)
├── Adaptive positioning (above/below based on viewport space)
├── Medium suggestion size
└── Max-height: 250px

MOBILE (<640px)
├── Full-width dropdown (if space allows)
├── Larger touch targets (44x44px minimum)
├── Virtual keyboard awareness
└── Suggestion items: 56px tall (touch-friendly)
```

### Touch Optimization

- Larger tap targets (56px min height on mobile)
- No hover effects on touch devices
- Swipe gestures for dismissing dropdown
- Auto-hide virtual keyboard on selection

---

## 8. Form Integration (TanStack Form)

### Seamless Integration Pattern

```tsx
import { useForm } from '@tanstack/react-form';
import { zodValidator } from '@tanstack/zod-form-adapter';
import { AddressAutocomplete } from '@locnative/react-ui';

const checkoutForm = useForm({
  defaultValues: {
    address: '',
    suburb: '',
    state: '',
    postcode: '',
  },
  onSubmit: async (values) => {
    // Your API call
  },
});

// In component
<form onSubmit={(e) => {
  e.preventDefault();
  checkoutForm.handleSubmit();
}}>
  {checkoutForm.Field(
    { name: 'address' },
    (field) => (
      <div>
        <AddressAutocomplete
          value={field.state.value}
          onSelect={(address) => {
            field.setValue(address.streetAddress);
            checkoutForm.setFieldValue('suburb', address.suburb);
            checkoutForm.setFieldValue('state', address.state);
            checkoutForm.setFieldValue('postcode', address.postcode);
          }}
          error={field.state.meta.errors?.[0]}
          validate={async (address) => {
            try {
              await checkAddressValid(address);
              return null;
            } catch (err) {
              return { message: err.message };
            }
          }}
        />
      </div>
    ),
  )}
</form>
```

---

## 9. Geolocation & Proximity Boosting

### Auto-Detection + Manual Override

```tsx
<AddressAutocomplete
  enableGeolocation={true}
  onGeolocationError={(error) => {
    console.log('User denied location access:', error);
  }}
  proximityBoostRadius={50} // km
/>
```

### Manual Coordinates

```tsx
<AddressAutocomplete
  userLat={-37.8136}
  userLng={144.9631}
  proximityBoostRadius={25}
/>
```

---

## 10. Error Handling

### Graceful Error States

```typescript
interface AddressAutocompleteState {
  status: 'idle' | 'loading' | 'success' | 'error' | 'no-results';
  error?: {
    type: 'network' | 'rate-limit' | 'invalid-key' | 'validation';
    message: string;
    retryable: boolean;
  };
}
```

### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| No results | Show "No addresses found" + "Enter address manually" option |
| Network timeout | Show "Connection error, please try again" |
| Rate limited (429) | Show "Too many requests, please wait a moment" |
| Invalid API key | Show "Service unavailable" (log actual error server-side) |
| Validation fails | Show validation error from validate prop |

---

## 11. Session Tokens (Billing Optimization)

### Developer-Provided Tokens

```tsx
import { newSessionToken } from '@locnative/sdk';

export function CheckoutAddressForm() {
  const sessionTokenRef = useRef<string>('');

  useEffect(() => {
    // Create token once when form is initialized
    sessionTokenRef.current = newSessionToken();
  }, []);

  return (
    <AddressAutocomplete
      sessionToken={sessionTokenRef.current}
      onSelect={(address) => {
        // Once user selects, discard token
        sessionTokenRef.current = '';
      }}
    />
  );
}
```

---

## 12. Internationalization (Framework-Agnostic)

### Built-in String Customization

```tsx
<AddressAutocomplete
  i18nStrings={{
    noResults: 'Keine Adressen gefunden',
    enterManually: 'Adresse manuell eingeben',
    errorRetry: 'Erneut versuchen',
    geolocationError: 'Standortzugriff verweigert',
  }}
/>
```

### i18n Library Integration

```tsx
import { useTranslation } from 'react-i18next';

export function AddressField() {
  const { t } = useTranslation('forms');

  return (
    <AddressAutocomplete
      i18nStrings={{
        noResults: t('address.noResults'),
        enterManually: t('address.manual'),
      }}
    />
  );
}
```

---

## 13. Complete Component List

### Phase 1: MVP (Addresses)

- ✅ AddressAutocomplete
- ✅ ReverseGeocodeInput
- ✅ ForwardGeocodeInput
- ✅ AddressFormField (composed)
- ✅ AddressFieldGroup (composed)

### Phase 2: Routing

- 🔄 DirectionsWidget
- 🔄 DistanceMatrixInput
- 🔄 IsochroneMap

### Phase 3: Regions & Zones

- 🔄 RegionClassifier
- 🔄 ZoneSelector
- 🔄 ZonePolygonMap

### Phase 4: Advanced

- 🔄 LocationPicker (map + autocomplete)
- 🔄 TravelTimeCalculator
- 🔄 RouteOptimizer

---

## 14. Documentation Requirements

### Tier 1: API Reference

- TypeScript types for all props
- Return value documentation
- Event callbacks
- Examples for each component

### Tier 2: Implementation Guides

- "Getting Started" tutorial
- "Integration with TanStack Form"
- "Customizing Styling"
- "Mobile Optimization"
- "Accessibility Checklist"
- "Geolocation & Privacy"

### Tier 3: Interactive Documentation

- Storybook with live component previews
  - React stories
  - Vue stories
  - Interactive prop testing
- Interactive docs site (Next.js/Nuxt)
  - Copy-paste examples
  - Live CodeSandbox links
  - Dark mode toggle

### Tier 4: Video Content

- 5-10 min "Getting Started" video
- "Customization Deep Dive"
- "Mobile Implementation"

---

## 15. Quality Standards

### Testing

| Type | Coverage | Tools |
|------|----------|-------|
| Unit Tests | >80% | Vitest (React), Vitest (Vue) |
| Integration Tests | All user flows | Playwright |
| E2E Tests | Critical paths | Cypress |
| A11y Tests | Automated + manual | axe, WAVE |
| Visual Regression | Key components | Percy/Chromatic |

### Build & Deployment

```bash
npm run test          # Run all tests
npm run build         # Build both packages
npm run type-check    # TypeScript validation
npm run lint          # ESLint + Prettier
npm run a11y-test     # Accessibility testing
```

### Bundle Size Budget

- @locnative/react-ui: <50KB gzipped
- @locnative/vue-ui: <50KB gzipped

**Monitoring:** Bundle size checks on every PR.

---

## 16. Implementation Phases

### Phase 1: MVP (Months 1-2)

- AddressAutocomplete (React + Vue)
- ReverseGeocodeInput
- ForwardGeocodeInput
- Basic theming (light/dark)
- TanStack Form integration
- Core documentation

### Phase 2: Form Integration (Month 3)

- AddressFormField
- AddressFieldGroup (with auto-population)
- Async validation support
- i18n framework integration

### Phase 3: Geolocation & Mobile (Month 4)

- Geolocation integration
- Proximity boosting
- Mobile responsiveness polish
- Touch optimization

### Phase 4: Advanced (Month 5+)

- Routing components
- Region/Zone components
- Advanced customization
- Performance optimization

---

## 17. Success Metrics

### Developer Experience

- ✅ Setup time: <5 minutes to first autocomplete
- ✅ Time to full form: <30 minutes
- ✅ Zero breaking changes between minor versions
- ✅ >90% of common use cases have examples

### Technical

- ✅ <50KB gzipped bundle size
- ✅ >80% test coverage
- ✅ WCAG 2.1 AA compliance
- ✅ Zero critical security vulnerabilities
- ✅ <100ms time-to-interactive on mobile

### Adoption

- ✅ NPM downloads trending up
- ✅ GitHub stars growth
- ✅ Community contributions
- ✅ Zero "Cannot customize" issues on GitHub

---

## 18. Deliverables Checklist

### Code

- React component package (@locnative/react-ui)
- Vue component package (@locnative/vue-ui)
- TypeScript types (full coverage)
- Tailwind CSS default styles
- ShadCN/ui integration
- CSS variables theming system

### Documentation

- Component API reference
- Implementation guides (5+)
- Storybook with 50+ stories
- Interactive docs site
- Video tutorials (3+)

### Testing

- Unit tests (>80% coverage)
- Integration tests (all critical flows)
- E2E tests (Cypress)
- A11y tests (automated + manual)
- Visual regression tests

### DevOps

- GitHub Actions CI/CD
- Automated bundle size tracking
- Pre-release testing in sandbox
- NPM auto-publish on merge to main

---

## 19. Success Criteria (Go/No-Go)

**Ship Phase 1 when:**
- ✅ All tests passing (>80% coverage)
- ✅ WCAG 2.1 AA audit complete
- ✅ Documentation 90% complete
- ✅ Internal team sign-off
- ✅ Beta testers positive feedback

---

## 20. Open Questions for Locnative Team

1. Development timeline: How many developers can dedicate to this?
2. Support model: Who maintains components post-launch?
3. Feedback loop: How will community feedback shape roadmap?
4. Commercial: Free open-source or premium tiers?
5. Marketing: How will this be promoted to developers?

---

## Final Note

This specification reflects a first-class developer experience. The component library should feel as intuitive as Google Places, but with the flexibility and depth that Locnative' data deserves.

**Next step:** Share this with the Locnative team and gather feedback before implementation begins.
