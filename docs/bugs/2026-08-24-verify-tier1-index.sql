-- Verification for commit 3ec943f (Tier 1 ILIKE -> LIKE).
-- Run against production/replica. See .planning/debug/autocomplete-tier1-ilike.md
--
-- BEFORE (the bug): expect Bitmap Heap Scan on idx_addresses_search_text_trgm
-- with a large "Rows Removed by Index Recheck", multi-second on cold cache.
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM addresses
WHERE search_text ILIKE '407%' AND country = 'AU'
LIMIT 10;

-- AFTER (the fix): expect Index Scan / Bitmap Index Scan on
-- idx_addresses_search_text_btree, single-digit ms.
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM addresses
WHERE search_text LIKE '407%' AND country = 'AU'
LIMIT 10;

-- Confirms the opclass that makes the difference. Expect text_pattern_ops
-- for idx_addresses_search_text_btree.
SELECT i.relname AS index_name, op.opcname AS opclass
FROM pg_index x
JOIN pg_class i ON i.oid = x.indexrelid
JOIN pg_class t ON t.oid = x.indrelid
JOIN pg_opclass op ON op.oid = ANY(x.indclass::oid[])
WHERE t.relname = 'addresses'
  AND i.relname = 'idx_addresses_search_text_btree';

-- Equivalence check: the two predicates must return the same rows, since
-- search_text is stored uppercase. Expect 0.
SELECT count(*) AS should_be_zero FROM (
  SELECT id FROM addresses WHERE search_text ILIKE '407%'
  EXCEPT
  SELECT id FROM addresses WHERE search_text LIKE '407%'
) AS diff;
