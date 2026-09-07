-- Bare-postcode autocomplete needs postcode before state in its scan key.
--
-- The existing (country, state, postcode) index is efficient only when callers
-- supply state. Country-only requests such as AU/2000 cannot constrain postcode
-- through that index, and the old DISTINCT ON query then reads and sorts every
-- address in the postcode before LIMIT applies. That is why adding state made
-- dense postcode requests return while the otherwise identical request hung.
--
-- postcodeSearch now performs a loose index scan over distinct locality/state
-- keys and fetches the lowest-id representative row for each key. This ordering
-- supports both seeks without scanning the duplicate addresses between them.
--
-- CONCURRENTLY avoids blocking reads and writes while this large index builds.
-- It cannot run inside a transaction. If interrupted, drop the INVALID index
-- and re-run this migration.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_addresses_country_postcode_locality_state_id"
ON "addresses" USING btree ("country", "postcode", "locality", coalesce("state", ''), "id");
