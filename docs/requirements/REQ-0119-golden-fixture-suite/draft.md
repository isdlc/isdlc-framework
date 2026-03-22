# REQ-0119 — Golden fixture suite for workflow state transitions

Fixture projects with representative state.json and meta.json snapshots for all workflow types: discover_existing, feature, fix, test_generate, test_run, upgrade, analyze, implementation_loop, and quality_loop. Golden test runner loads each fixture, simulates workflow steps via core models, and validates output matches expected state mutations and artifacts.
