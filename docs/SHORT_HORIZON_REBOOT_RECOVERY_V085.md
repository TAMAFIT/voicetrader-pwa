# VoiceTrader Local Edge Lab v0.85 — Reboot Recovery Evidence

## Goal

Prove that a later Windows reboot actually occurred and that the Local Edge Lab returned to a healthy research state after that new boot, without manual inspection and without changing any prediction/trading rule.

v0.85 is an **operations-evidence overlay** on top of a health-PASS v0.84 installation.

## Evidence model

A process restart is not accepted as reboot proof.

The worker derives an approximate Windows boot epoch from:

`current wall-clock time - OS uptime`

The boot epoch is normalized into a stable boot ID. At overlay installation, the current boot ID is persisted as the baseline. `rebootRecoveryProven=true` requires all of:

1. exact 40-hex overlay/runtime provenance is present;
2. the observed boot ID differs from the installation baseline boot ID;
3. the existing v0.84 full health gate returns `PASS` after the new boot.

The witness is written to:

`state/local-edge-lab-v085-reboot-witness.json`

The baseline is written to:

`state/local-edge-lab-v085-reboot-baseline.json`

## Startup behavior

The overlay registers one Windows Scheduled Task:

`VoiceTrader-LocalNode-RebootWitness`

It runs at Windows startup. On a genuinely new boot it waits for the research workers to recover and repeatedly evaluates the v0.84 health gate. If health does not recover before the bounded timeout, the witness remains unproven and the task exits non-zero so Task Scheduler's restart-on-failure policy can retry.

On the same boot used to install the overlay, the worker records `BASELINE_BOOT`; that is intentionally **not** reboot proof.

## Overlay installation boundary

`configure-v085-reboot-recovery.ps1` refuses to run unless:

- a v0.84 installation receipt exists;
- the v0.84 receipt says its installation health gate passed;
- current live v0.84 health also passes;
- Node.js 22+ is available;
- the overlay source is an exact immutable 40-hex commit.

The v0.85 source/test files are staged and tested before being copied into the existing runtime. Only the two v0.85 Node files and the dedicated RebootWitness Scheduled Task are mutated.

If overlay installation fails, prior versions of those files/task are restored. Existing raw/derived data and v0.84 worker tasks are not removed.

## Scientific and execution boundary

v0.85 does not read or modify:

- Human Canon / Frozen experiment thresholds;
- Adaptive learning policy;
- Blind Exam results;
- cross-venue scorecard results;
- order routes or credentials.

Always false:

- `predictionInputAuthorized`
- `executionAuthorized`
- `orderSubmission`
- `realMoneyRouting`
- cloud upload

A reboot-recovery witness is operational evidence only. It is not profitability, calibration, or edge evidence.

## Promotion truth

GitHub implementation of v0.85 does not prove operator-PC reboot recovery. That claim may be made only after the overlay is installed on the actual machine, a later Windows boot produces a new boot ID, and the post-boot health witness says `PROVEN`.
