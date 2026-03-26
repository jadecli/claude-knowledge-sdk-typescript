import { describe, it, expect } from 'vitest';
import {
  calculateCost,
  generateOtelEnvVars,
  generateOtelShellScript,
  generateDockerCompose,
  generateOtelCollectorConfig,
  generatePrometheusConfig,
  generateFullSetupScript,
  MODEL_PRICING,
  OTEL_METRICS,
  OTEL_LABELS,
} from '../index.js';
import type { OtelConfig } from '../index.js';

describe('calculateCost', () => {
  it('calculates Sonnet cost for 1M input + 1M output', () => {
    const cost = calculateCost('claude-sonnet-4-6', 1_000_000, 1_000_000) as number;
    // $3/M input + $15/M output = $18
    expect(cost).toBeCloseTo(18, 2);
  });

  it('calculates Opus cost correctly', () => {
    const cost = calculateCost('claude-opus-4-6', 1_000_000, 1_000_000) as number;
    // $15/M input + $75/M output = $90
    expect(cost).toBeCloseTo(90, 2);
  });

  it('calculates Haiku cost correctly', () => {
    const cost = calculateCost('claude-haiku-4-5', 1_000_000, 1_000_000) as number;
    // $0.80/M input + $4/M output = $4.80
    expect(cost).toBeCloseTo(4.8, 2);
  });

  it('includes cache write and read costs', () => {
    const withoutCache = calculateCost('claude-sonnet-4-6', 1_000_000, 0, 0, 0) as number;
    const withCache = calculateCost('claude-sonnet-4-6', 1_000_000, 0, 500_000, 500_000) as number;
    expect(withCache).toBeGreaterThan(withoutCache);
    // cache write: 500K * $3.75/M = $1.875, cache read: 500K * $0.30/M = $0.15
    expect(withCache - withoutCache).toBeCloseTo(1.875 + 0.15, 4);
  });

  it('matches exact model name before family keyword', () => {
    // Exact match should use the right pricing
    const opusCost = calculateCost('claude-opus-4-6', 1_000_000, 0) as number;
    expect(opusCost).toBeCloseTo(15, 2); // $15/M input
  });

  it('matches model family keyword for versioned names', () => {
    // "claude-opus-4-20250514" contains "opus" — should match Opus pricing
    const cost = calculateCost('claude-opus-4-20250514', 1_000_000, 0) as number;
    expect(cost).toBeCloseTo(15, 2);
  });

  it('defaults unknown models to Sonnet pricing', () => {
    const cost = calculateCost('some-unknown-model', 1_000_000, 1_000_000) as number;
    expect(cost).toBeCloseTo(18, 2); // Sonnet rates
  });

  it('returns 0 for zero tokens', () => {
    const cost = calculateCost('claude-sonnet-4-6', 0, 0) as number;
    expect(cost).toBe(0);
  });
});

describe('generateOtelEnvVars', () => {
  const baseConfig: OtelConfig = {
    backend: 'prometheus',
    endpoint: 'http://localhost:4317',
    protocol: 'grpc',
    exportIntervalMs: 60_000,
    logPrompts: false,
    logToolDetails: true,
    includeSessionId: true,
  };

  it('always includes CLAUDE_CODE_ENABLE_TELEMETRY', () => {
    const env = generateOtelEnvVars(baseConfig);
    expect(env.CLAUDE_CODE_ENABLE_TELEMETRY).toBe('1');
  });

  it('always includes both METRICS and LOGS exporters', () => {
    const env = generateOtelEnvVars(baseConfig);
    expect(env.OTEL_METRICS_EXPORTER).toBe('otlp');
    expect(env.OTEL_LOGS_EXPORTER).toBe('otlp');
  });

  it('sets protocol and endpoint', () => {
    const env = generateOtelEnvVars(baseConfig);
    expect(env.OTEL_EXPORTER_OTLP_PROTOCOL).toBe('grpc');
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://localhost:4317');
  });

  it('includes auth header when provided', () => {
    const env = generateOtelEnvVars({ ...baseConfig, authHeader: 'Bearer token123' });
    expect(env.OTEL_EXPORTER_OTLP_HEADERS).toBe('Bearer token123');
  });

  it('omits auth header when not provided', () => {
    const env = generateOtelEnvVars(baseConfig);
    expect(env.OTEL_EXPORTER_OTLP_HEADERS).toBeUndefined();
  });

  it('sets log prompts flag when enabled', () => {
    const env = generateOtelEnvVars({ ...baseConfig, logPrompts: true });
    expect(env.OTEL_LOG_USER_PROMPTS).toBe('1');
  });

  it('omits log prompts flag when disabled', () => {
    const env = generateOtelEnvVars(baseConfig);
    expect(env.OTEL_LOG_USER_PROMPTS).toBeUndefined();
  });

  it('sets session ID flag when enabled', () => {
    const env = generateOtelEnvVars(baseConfig);
    expect(env.OTEL_METRICS_INCLUDE_SESSION_ID).toBe('1');
  });
});

describe('generateOtelShellScript', () => {
  const config: OtelConfig = {
    backend: 'prometheus',
    endpoint: 'http://localhost:4317',
    protocol: 'grpc',
    exportIntervalMs: 60_000,
    logPrompts: false,
    logToolDetails: false,
    includeSessionId: false,
  };

  it('generates a bash script', () => {
    const script = generateOtelShellScript(config);
    expect(script).toContain('#!/bin/bash');
  });

  it('includes export statements', () => {
    const script = generateOtelShellScript(config);
    expect(script).toContain('export CLAUDE_CODE_ENABLE_TELEMETRY="1"');
    expect(script).toContain('export OTEL_LOGS_EXPORTER="otlp"');
  });

  it('documents the LOGS protocol requirement', () => {
    const script = generateOtelShellScript(config);
    expect(script).toContain('LOGS protocol');
  });

  it('warns about DISABLE_TELEMETRY confusion', () => {
    const script = generateOtelShellScript(config);
    expect(script).toContain('DISABLE_TELEMETRY');
  });
});

describe('generateDockerCompose', () => {
  it('generates Prometheus stack', () => {
    const compose = generateDockerCompose('prometheus');
    expect(compose).toContain('otel-collector');
    expect(compose).toContain('prometheus');
    expect(compose).toContain('grafana');
    expect(compose).toContain('4317:4317');
    expect(compose).toContain('9090:9090');
  });

  it('generates SigNoz stack', () => {
    const compose = generateDockerCompose('signoz');
    expect(compose).toContain('signoz');
    expect(compose).toContain('3301:3301');
  });

  it('returns generic instructions for other backends', () => {
    const compose = generateDockerCompose('datadog');
    expect(compose).toContain('datadog');
    expect(compose).toContain('4317');
  });
});

describe('OTEL_METRICS constants', () => {
  it('has cost and token metrics', () => {
    expect(OTEL_METRICS.cost).toBe('claude_code_cost_usage_USD_total');
    expect(OTEL_METRICS.tokens).toBe('claude_code_token_usage_tokens_total');
  });
});

describe('OTEL_LABELS constants', () => {
  it('has standard label names', () => {
    expect(OTEL_LABELS.model).toBe('model');
    expect(OTEL_LABELS.tokenType).toBe('type');
  });
});

describe('generateOtelCollectorConfig', () => {
  const config: OtelConfig = {
    backend: 'prometheus',
    endpoint: 'http://localhost:4317',
    protocol: 'grpc',
    exportIntervalMs: 60_000,
    logPrompts: false,
    logToolDetails: false,
    includeSessionId: false,
  };

  it('generates YAML with otlp receivers on 4317 and 4318', () => {
    const yaml = generateOtelCollectorConfig(config);
    expect(yaml).toContain('0.0.0.0:4317');
    expect(yaml).toContain('0.0.0.0:4318');
  });

  it('includes prometheus exporter for prometheus backend', () => {
    const yaml = generateOtelCollectorConfig(config);
    expect(yaml).toContain('prometheusremotewrite');
    expect(yaml).toContain('0.0.0.0:8889');
  });

  it('includes otlp exporter for non-prometheus backends', () => {
    const yaml = generateOtelCollectorConfig({
      ...config,
      backend: 'datadog',
      endpoint: 'https://datadog.example.com',
    });
    expect(yaml).toContain('otlp:');
    expect(yaml).toContain('https://datadog.example.com');
  });

  it('includes memory_limiter and batch processors', () => {
    const yaml = generateOtelCollectorConfig(config);
    expect(yaml).toContain('memory_limiter');
    expect(yaml).toContain('batch');
  });

  it('has both metrics and logs pipelines', () => {
    const yaml = generateOtelCollectorConfig(config);
    expect(yaml).toContain('metrics:');
    expect(yaml).toContain('logs:');
  });

  it('logs pipeline uses debug exporter for prometheus (not prometheusremotewrite)', () => {
    const yaml = generateOtelCollectorConfig(config);
    // Extract the logs pipeline line
    const logsSection = yaml.split('logs:')[1];
    expect(logsSection).toBeDefined();
    expect(logsSection).toContain('exporters: [debug]');
    // Ensure logs does NOT use prometheusremotewrite (it only supports metrics)
    const logsPipeline = logsSection!.split('exporters:')[1]?.split('\n')[0];
    expect(logsPipeline).not.toContain('prometheusremotewrite');
  });

  it('logs pipeline uses otlp exporter for non-prometheus backends', () => {
    const yaml = generateOtelCollectorConfig({ ...config, backend: 'datadog', endpoint: 'https://dd.example.com' });
    const logsSection = yaml.split('logs:')[1];
    expect(logsSection).toContain('exporters: [otlp]');
  });

  it('includes debug exporter in exporters block for prometheus', () => {
    const yaml = generateOtelCollectorConfig(config);
    expect(yaml).toContain('debug: {}');
  });

  it('formats authHeader from OTLP env format to YAML key-value', () => {
    const yaml = generateOtelCollectorConfig({
      ...config,
      backend: 'honeycomb',
      endpoint: 'https://api.honeycomb.io',
      authHeader: 'x-honeycomb-team=my-api-key',
    });
    expect(yaml).toContain('x-honeycomb-team: "my-api-key"');
    expect(yaml).not.toContain('x-honeycomb-team=my-api-key');
  });
});

describe('generatePrometheusConfig', () => {
  it('scrapes otel-collector:8889', () => {
    const yaml = generatePrometheusConfig();
    expect(yaml).toContain('otel-collector:8889');
  });

  it('has a claude-code job that filters claude_code_ metrics', () => {
    const yaml = generatePrometheusConfig();
    expect(yaml).toContain('claude-code');
    expect(yaml).toContain('claude_code_.*');
  });
});

describe('generateFullSetupScript', () => {
  const config: OtelConfig = {
    backend: 'prometheus',
    endpoint: 'http://localhost:4317',
    protocol: 'grpc',
    exportIntervalMs: 60_000,
    logPrompts: false,
    logToolDetails: false,
    includeSessionId: false,
  };

  it('generates executable bash script', () => {
    const script = generateFullSetupScript(config);
    expect(script).toContain('#!/bin/bash');
    expect(script).toContain('set -euo pipefail');
  });

  it('creates all 4 config files', () => {
    const script = generateFullSetupScript(config);
    expect(script).toContain('otel-collector-config.yaml');
    expect(script).toContain('prometheus.yml');
    expect(script).toContain('docker-compose.yml');
    expect(script).toContain('claude-otel-env.sh');
  });

  it('includes startup instructions', () => {
    const script = generateFullSetupScript(config);
    expect(script).toContain('docker compose up -d');
    expect(script).toContain('source claude-otel-env.sh');
  });

  it('includes key metrics references', () => {
    const script = generateFullSetupScript(config);
    expect(script).toContain('claude_code_cost_usage_USD_total');
    expect(script).toContain('claude_code_token_usage_tokens_total');
  });

  it('includes Prometheus dashboard URLs', () => {
    const script = generateFullSetupScript(config);
    expect(script).toContain('localhost:9090');
    expect(script).toContain('localhost:3000');
  });
});
