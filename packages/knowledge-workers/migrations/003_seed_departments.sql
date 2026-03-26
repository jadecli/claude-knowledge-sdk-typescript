-- ═══════════════════════════════════════════════════════════════
-- 003_seed_departments.sql
-- 12 departments matching jade-{dept} plugin repos
-- ═══════════════════════════════════════════════════════════════

INSERT INTO dim_department (department_id, department_name, plugin_repo, cost_center) VALUES
('engineering',        'Engineering',        'jadecli/jade-engineering',        'CC-ENG-100'),
('product-management', 'Product Management', 'jadecli/jade-product-management', 'CC-PM-200'),
('sales',              'Sales',              'jadecli/jade-sales',              'CC-SAL-300'),
('customer-support',   'Customer Support',   'jadecli/jade-customer-support',   'CC-SUP-400'),
('marketing',          'Marketing',          'jadecli/jade-marketing',          'CC-MKT-500'),
('legal',              'Legal',              'jadecli/jade-legal',              'CC-LEG-600'),
('finance',            'Finance',            'jadecli/jade-finance',            'CC-FIN-700'),
('data',               'Data',               'jadecli/jade-data',               'CC-DAT-800'),
('operations',         'Operations',         'jadecli/jade-operations',         'CC-OPS-900'),
('design',             'Design',             'jadecli/jade-design',             'CC-DSN-1000'),
('enterprise-search',  'Enterprise Search',  'jadecli/jade-enterprise-search',  'CC-SRC-1100'),
('productivity',       'Productivity',       'jadecli/jade-productivity',       'CC-PRD-1200');
