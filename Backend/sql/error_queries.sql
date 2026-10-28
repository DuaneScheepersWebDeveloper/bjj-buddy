-- =====================================================================
-- BJJ Buddy: handy queries for the error_log table (PostgreSQL)
--
-- Connect to the dev database (Docker container from start.sh):
--   docker exec -it bjj-postgres psql -U postgres -d bjjbuddy
-- Then paste any query below. Or use pgAdmin / DBeaver / VS Code.
-- =====================================================================


-- 1. Latest 50 errors ---------------------------------------------------
SELECT id, created_at, level, source, error_type, status_code,
       http_method, path, left(message, 120) AS message, request_id
FROM error_log
ORDER BY created_at DESC
LIMIT 50;


-- 2. Top distinct problems in the last 7 days (grouped by fingerprint) --
SELECT fingerprint,
       count(*)                          AS occurrences,
       count(DISTINCT user_id)           AS users_affected,
       min(created_at)                   AS first_seen,
       max(created_at)                   AS last_seen,
       CASE max(CASE level WHEN 'CRITICAL' THEN 3 WHEN 'ERROR' THEN 2 ELSE 1 END)
            WHEN 3 THEN 'CRITICAL' WHEN 2 THEN 'ERROR' ELSE 'WARNING' END AS level,
       max(source)                       AS source,
       max(error_type)                   AS error_type,
       max(route)                        AS route,
       left(max(message), 120)           AS sample_message,
       max(id)                           AS latest_id
FROM error_log
WHERE created_at > now() - interval '7 days'
  AND NOT resolved
GROUP BY fingerprint
ORDER BY occurrences DESC;


-- 3. Only real failures (no 4xx warnings), last 24 hours ---------------
SELECT id, created_at, source, error_type, route, left(message, 150) AS message
FROM error_log
WHERE level IN ('ERROR', 'CRITICAL')
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;


-- 4. Full detail for one error (stack trace, body, context) ------------
SELECT * FROM error_log WHERE id = 1;            -- change the id

-- ...or look up the error a user saw, using the request_id the API
-- returned in the 500 response / X-Request-ID header:
SELECT * FROM error_log WHERE request_id = 'paste-request-id-here';


-- 5. Errors per hour (spot spikes after a deploy) ----------------------
SELECT date_trunc('hour', created_at) AS hour,
       count(*) FILTER (WHERE level = 'WARNING')               AS warnings,
       count(*) FILTER (WHERE level IN ('ERROR', 'CRITICAL'))  AS errors
FROM error_log
WHERE created_at > now() - interval '3 days'
GROUP BY 1
ORDER BY 1 DESC;


-- 6. Which endpoints fail most ------------------------------------------
SELECT http_method, route, status_code, count(*) AS n
FROM error_log
WHERE source = 'backend'
  AND created_at > now() - interval '7 days'
GROUP BY http_method, route, status_code
ORDER BY n DESC;


-- 7. Mobile app crashes by screen / platform ---------------------------
SELECT platform,
       context->>'screen'              AS screen,
       (context->>'is_fatal')::boolean AS fatal,
       error_type,
       count(*)                        AS n,
       max(created_at)                 AS last_seen
FROM error_log
WHERE source = 'mobile'
GROUP BY 1, 2, 3, 4
ORDER BY n DESC;


-- 8. Everything that went wrong for one user ---------------------------
SELECT created_at, level, source, error_type, path, left(message, 120) AS message
FROM error_log
WHERE user_id = 1                                -- change the user id
ORDER BY created_at DESC;


-- 9. Search messages / stack traces ------------------------------------
SELECT id, created_at, error_type, left(message, 150) AS message
FROM error_log
WHERE message ILIKE '%duplicate key%'
   OR stack_trace ILIKE '%duplicate key%'
ORDER BY created_at DESC;


-- 10. Search inside JSON fields (request body / context) ---------------
SELECT id, created_at, path, request_body
FROM error_log
WHERE request_body->>'gym_name' = 'Gracie Barra';

SELECT id, created_at, context
FROM error_log
WHERE context ? 'session_id';                    -- rows whose context has this key


-- 11. Mark a problem as fixed (all rows with the same fingerprint) -----
UPDATE error_log
SET resolved = true, resolved_at = now()
WHERE fingerprint = 'paste-fingerprint-here';


-- 12. Housekeeping: delete rows older than 90 days ---------------------
DELETE FROM error_log WHERE created_at < now() - interval '90 days';


-- Optional: a saved view so query 2 is just `SELECT * FROM error_summary;`
CREATE OR REPLACE VIEW error_summary AS
SELECT fingerprint,
       count(*)                AS occurrences,
       count(DISTINCT user_id) AS users_affected,
       min(created_at)         AS first_seen,
       max(created_at)         AS last_seen,
       CASE max(CASE level WHEN 'CRITICAL' THEN 3 WHEN 'ERROR' THEN 2 ELSE 1 END)
            WHEN 3 THEN 'CRITICAL' WHEN 2 THEN 'ERROR' ELSE 'WARNING' END AS level,
       max(source)             AS source,
       max(error_type)         AS error_type,
       max(route)              AS route,
       left(max(message), 200) AS sample_message,
       bool_and(resolved)      AS resolved
FROM error_log
GROUP BY fingerprint;
