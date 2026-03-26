-- ═══════════════════════════════════════════════════════════════
-- 004_seed_job_profiles.sql
-- ~30 job profiles covering all named agents from department registry
-- ═══════════════════════════════════════════════════════════════

INSERT INTO dim_job_profile (job_profile_id, title, level_id, track, department_id, job_family) VALUES

-- Engineering (5 agents)
('eng-vp',           'VP Engineering',              10, 'executive',    'engineering', 'engineering'),
('eng-director',     'Director, Engineering',        8, 'management',  'engineering', 'engineering'),
('eng-senior-mgr',   'Senior Engineering Manager',   7, 'management',  'engineering', 'engineering'),
('eng-lead',         'Senior SDE / Tech Lead',       6, 'ic_senior',   'engineering', 'engineering'),
('eng-sde-ii',       'Software Development Engineer II', 5, 'ic',      'engineering', 'engineering'),

-- Product Management (4 agents)
('product-vp',       'VP Product',                  10, 'executive',    'product-management', 'product'),
('product-director', 'Director, Product',             8, 'management',  'product-management', 'product'),
('product-pm',       'Senior Product Manager',        6, 'ic_senior',   'product-management', 'product'),
('product-analyst',  'Product Analyst',               4, 'ic',          'product-management', 'product'),

-- Sales (4 agents)
('sales-vp',         'VP Sales',                    10, 'executive',    'sales', 'sales'),
('sales-director',   'Director, Sales',               8, 'management',  'sales', 'sales'),
('sales-ae',         'Account Executive',              5, 'ic',          'sales', 'sales'),
('sales-sdr',        'Sales Development Rep',          4, 'ic',          'sales', 'sales'),

-- Customer Support (3 agents)
('support-director', 'Director, Support',              8, 'management',  'customer-support', 'support'),
('support-mgr',      'Support Manager',                6, 'management',  'customer-support', 'support'),
('support-agent',    'Support Engineer',                5, 'ic',          'customer-support', 'support'),

-- Marketing (3 agents)
('marketing-vp',     'VP Marketing',                 10, 'executive',    'marketing', 'marketing'),
('marketing-mgr',    'Marketing Manager',              6, 'management',  'marketing', 'marketing'),
('marketing-spe',    'Marketing Specialist',            5, 'ic',          'marketing', 'marketing'),

-- Legal (3 agents)
('legal-gc',         'General Counsel',               10, 'executive',    'legal', 'legal'),
('legal-counsel',    'Senior Counsel',                  7, 'ic_principal', 'legal', 'legal'),
('legal-para',       'Paralegal',                       5, 'ic',          'legal', 'legal'),

-- Finance (3 agents)
('finance-cfo',      'Chief Financial Officer',       10, 'executive',    'finance', 'finance'),
('finance-ctrl',     'Controller',                      8, 'management',  'finance', 'finance'),
('finance-analyst',  'Financial Analyst',                5, 'ic',          'finance', 'finance'),

-- Data (3 agents)
('data-director',    'Director, Data',                  8, 'management',  'data', 'data'),
('data-eng',         'Senior Data Engineer',            6, 'ic_senior',   'data', 'data'),
('data-analyst',     'Data Analyst',                    5, 'ic',          'data', 'data'),

-- Operations (3 agents)
('ops-vp',           'VP Operations',                 10, 'executive',    'operations', 'operations'),
('ops-mgr',          'Operations Manager',              6, 'management',  'operations', 'operations'),
('ops-analyst',      'Operations Analyst',              5, 'ic',          'operations', 'operations'),

-- Design (2 agents)
('design-director',  'Director, Design',                8, 'management',  'design', 'design'),
('design-lead',      'Senior Designer',                 6, 'ic_senior',   'design', 'design'),

-- Enterprise Search (1 agent)
('search-lead',      'Search Engineering Lead',         6, 'ic_senior',   'enterprise-search', 'engineering'),

-- Productivity (1 agent)
('productivity-mgr', 'Productivity Lead',               6, 'management',  'productivity', 'operations'),

-- HR / Agent Portal (5 agents)
('hr-vp',            'VP People',                     10, 'executive',    'operations', 'hr'),
('hr-director',      'HR Director',                     8, 'management',  'operations', 'hr'),
('hr-mgr',           'HR Manager',                      6, 'management',  'operations', 'hr'),
('hr-recruiter',     'Recruiter',                       5, 'ic',          'operations', 'hr'),
('hr-coordinator',   'HR Coordinator',                  4, 'ic',          'operations', 'hr');
