# Changelog

All notable changes to `@locnative/react-ui` are documented here. This project adheres
to [Semantic Versioning](https://semver.org/) and the
[Keep a Changelog](https://keepachangelog.com/) format.

## [0.1.0] - 2026-06-18

First publishable release.

### Added

- **`AddressAutocomplete`** — debounced, WAI-ARIA combobox address search with keyboard
  navigation, proximity bias (`enableGeolocation` / `userLat` / `userLng`), session
  tokens, i18n strings, and fully customizable `render*` slots.
- **`AddressFormField`** — `AddressAutocomplete` with a label and error styling for forms.
- **`ForwardGeocodeInput`** — resolves free-text addresses to coordinates.
- **`ReverseGeocodeInput`** — resolves coordinates to the nearest address.
- **`AddressFieldGroup`** — controlled street/suburb/state/postcode field group.
- Utilities `toAddressWithParsed` and `cn`, plus exported component prop and value types.
- Prebuilt `styles.css` and dual ESM + CJS builds with bundled type declarations.

### Notes

- International address coverage (US/EU and more) is in **beta** and rolling out;
  availability may vary by deployment. Australian (G-NAF) coverage is authoritative.
</content>
