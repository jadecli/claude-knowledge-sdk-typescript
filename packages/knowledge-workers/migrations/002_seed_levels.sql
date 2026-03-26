-- ═══════════════════════════════════════════════════════════════
-- 002_seed_levels.sql
-- Amazon-style 12-level system (no L9) — IMMUTABLE reference data
-- ═══════════════════════════════════════════════════════════════

INSERT INTO dim_level (level_id, level_code, title_template, track_options, min_direct_reports, max_direct_reports, is_agent_eligible, comp_band_min, comp_band_max) VALUES

-- Operations track (L1-L3): NO agent personas
(1, 'L1', '{function} Associate I', ARRAY['operations'], 0, 0, false, 30000.00, 45000.00),
(2, 'L2', '{function} Associate', ARRAY['operations'], 0, 0, false, 40000.00, 60000.00),
(3, 'L3', 'Team Lead, {function}', ARRAY['operations'], 0, 5, false, 50000.00, 75000.00),

-- Corporate entry (L4): first agent-eligible level
(4, 'L4', '{role} I', ARRAY['ic'], 0, 0, true, 80000.00, 120000.00),

-- IC / dual-track (L5): most common level
(5, 'L5', '{role} II', ARRAY['ic', 'management'], 0, 6, true, 120000.00, 180000.00),

-- Manager / Senior IC (L6)
(6, 'L6', 'Senior {role}', ARRAY['management', 'ic_senior'], 6, 12, true, 160000.00, 240000.00),

-- Senior Manager / Principal IC (L7)
(7, 'L7', 'Senior Manager, {team}', ARRAY['management', 'ic_principal'], 2, 15, true, 200000.00, 320000.00),

-- Director / Senior Principal (L8)
(8, 'L8', 'Director, {function}', ARRAY['management', 'ic_principal'], 10, 200, true, 260000.00, 420000.00),

-- L9 intentionally skipped (gap between Director and VP)

-- VP / Distinguished Engineer (L10)
(10, 'L10', 'Vice President, {domain}', ARRAY['executive', 'ic_distinguished'], 50, 500, true, 350000.00, 600000.00),

-- S-Team SVP (L11)
(11, 'L11', 'Senior Vice President, {domain}', ARRAY['executive'], 100, NULL, true, 500000.00, 900000.00),

-- CEO (L12)
(12, 'L12', 'Chief Executive Officer', ARRAY['executive'], 0, NULL, false, 800000.00, NULL);
