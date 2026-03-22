# REQ-0120 — State migration verification tests

Verification tests beyond basic unit coverage for migrateState(): migration path tests (v0-v1, future v1-v2, missing schema_version, already-current), in-flight state compatibility (mid-workflow state survives migration), and doctor repair detection of incompatible state. Extends existing src/core/state/schema.js and tests/core/state/schema.test.js.
