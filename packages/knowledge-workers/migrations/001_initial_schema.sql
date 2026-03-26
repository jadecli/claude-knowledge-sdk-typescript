-- ═══════════════════════════════════════════════════════════════
-- 001_initial_schema.sql
-- Ralph Kimball star schema + PeopleSoft effective dating
-- Neon Postgres 18 with branching
-- ═══════════════════════════════════════════════════════════════

-- Pipeline stages enum (Greenhouse pattern)
CREATE TYPE pipeline_stage AS ENUM (
    'sourcing', 'applied', 'screen', 'phone_interview',
    'onsite_interview', 'scorecard_review', 'offer',
    'offer_accepted', 'hired', 'rejected', 'withdrawn'
);

-- ═══════════════════════════════════════════════════════
-- DIMENSION TABLES (slowly changing, SCD Type 2)
-- ═══════════════════════════════════════════════════════

-- Core: Level definitions (immutable reference)
CREATE TABLE dim_level (
    level_id        INT PRIMARY KEY,
    level_code      TEXT NOT NULL UNIQUE,
    title_template  TEXT NOT NULL,
    track_options   TEXT[] NOT NULL,
    min_direct_reports INT DEFAULT 0,
    max_direct_reports INT,
    is_agent_eligible BOOLEAN DEFAULT false,
    comp_band_min   NUMERIC(12,2),
    comp_band_max   NUMERIC(12,2),
    CONSTRAINT valid_level CHECK (level_id BETWEEN 1 AND 12 AND level_id != 9)
);

-- Core: Departments (SCD Type 2)
CREATE TABLE dim_department (
    department_sk   BIGSERIAL PRIMARY KEY,
    department_id   TEXT NOT NULL,
    department_name TEXT NOT NULL,
    parent_dept_id  TEXT,
    plugin_repo     TEXT,
    cost_center     TEXT,
    eff_start       TIMESTAMPTZ NOT NULL DEFAULT now(),
    eff_end         TIMESTAMPTZ DEFAULT '9999-12-31T00:00:00Z',
    is_current      BOOLEAN DEFAULT true
);

-- Core: Job profiles (Workday pattern)
CREATE TABLE dim_job_profile (
    job_profile_sk  BIGSERIAL PRIMARY KEY,
    job_profile_id  TEXT NOT NULL,
    title           TEXT NOT NULL,
    level_id        INT NOT NULL REFERENCES dim_level(level_id),
    track           TEXT NOT NULL,
    department_id   TEXT NOT NULL,
    job_family      TEXT NOT NULL,
    requirements    JSONB DEFAULT '{}',
    eff_start       TIMESTAMPTZ NOT NULL DEFAULT now(),
    eff_end         TIMESTAMPTZ DEFAULT '9999-12-31T00:00:00Z',
    is_current      BOOLEAN DEFAULT true,
    CONSTRAINT valid_track CHECK (track IN
        ('executive','management','ic_senior','ic_principal','ic_distinguished','ic','operations'))
);

-- Core: Supervisory organizations (Workday pattern)
CREATE TABLE dim_sup_org (
    sup_org_sk      BIGSERIAL PRIMARY KEY,
    sup_org_id      TEXT NOT NULL,
    org_name        TEXT NOT NULL,
    department_id   TEXT NOT NULL,
    manager_agent_id TEXT,
    parent_org_id   TEXT,
    headcount_budget INT,
    eff_start       TIMESTAMPTZ NOT NULL DEFAULT now(),
    eff_end         TIMESTAMPTZ DEFAULT '9999-12-31T00:00:00Z',
    is_current      BOOLEAN DEFAULT true
);

-- ═══════════════════════════════════════════════════════
-- FACT TABLE: Agent Registry (the core entity)
-- ═══════════════════════════════════════════════════════

CREATE TABLE fact_agent (
    agent_sk        BIGSERIAL PRIMARY KEY,
    agent_id        TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    agent_type      TEXT NOT NULL DEFAULT 'named',
    level_id        INT NOT NULL REFERENCES dim_level(level_id),
    job_profile_id  TEXT NOT NULL,
    department_id   TEXT NOT NULL,
    sup_org_id      TEXT NOT NULL,
    reports_to      TEXT,
    plugin_repo     TEXT,
    agent_definition JSONB,
    model_preference TEXT DEFAULT 'inherit',
    allowed_tools   TEXT[],
    skills          TEXT[],
    mcp_servers     TEXT[],
    system_prompt   TEXT,
    hire_date       DATE,
    status          TEXT NOT NULL DEFAULT 'active',
    eff_start       TIMESTAMPTZ NOT NULL DEFAULT now(),
    eff_end         TIMESTAMPTZ DEFAULT '9999-12-31T00:00:00Z',
    is_current      BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- RECRUITING (Greenhouse pattern)
-- ═══════════════════════════════════════════════════════

CREATE TABLE fact_requisition (
    req_sk          BIGSERIAL PRIMARY KEY,
    req_id          TEXT NOT NULL,
    job_profile_id  TEXT NOT NULL,
    sup_org_id      TEXT NOT NULL,
    hiring_manager  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open',
    pipeline_stage  TEXT DEFAULT 'sourcing',
    headcount       INT DEFAULT 1,
    opened_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    target_fill_date DATE,
    filled_date     DATE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- MIGRATION TRACKING
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS _migrations (
    id          SERIAL PRIMARY KEY,
    filename    TEXT NOT NULL UNIQUE,
    checksum    TEXT NOT NULL,
    applied_at  TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_agent_current ON fact_agent (agent_id) WHERE is_current = true;
CREATE INDEX idx_agent_dept ON fact_agent (department_id) WHERE is_current = true;
CREATE INDEX idx_agent_level ON fact_agent (level_id) WHERE is_current = true;
CREATE INDEX idx_agent_reports ON fact_agent (reports_to) WHERE is_current = true;
CREATE INDEX idx_dept_current ON dim_department (department_id) WHERE is_current = true;
CREATE INDEX idx_job_profile_current ON dim_job_profile (job_profile_id) WHERE is_current = true;
CREATE INDEX idx_sup_org_current ON dim_sup_org (sup_org_id) WHERE is_current = true;
