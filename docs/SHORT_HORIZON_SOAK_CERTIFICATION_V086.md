# VoiceTrader Local Edge Lab v0.86 — 24h Soak Certification

## Purpose

v0.86 proves sustained operations. It does not measure trading performance.

A single successful startup or reboot-recovery event is insufficient evidence that the dual-venue research pipeline can run continuously. v0.86 samples the existing v0.84 health state and monotonic operational counters once per minute, certifies complete UTC hour blocks, and requires 24 consecutive certified hours before reporting `PROVEN_24H`.

## Certified-hour policy

A UTC hour is certified only when all conditions pass:

- at least 50 samples in the hour;
- first sample within the first 2 minutes;
- last sample at or after minute 58;
- health PASS rate >= 95%;
- no monitored cumulative counter moves backward during the hour;
- Kraken raw message count increases;
- Kraken provider-time window count increases;
- Coinbase raw message count increases;
- Coinbase provider-time window count increases;
- cross-venue worker consumes additional Kraken windows;
- cross-venue worker consumes additional Coinbase windows;
- at least one new cross-venue pair is written.

A worker restart that resets counters therefore invalidates that hour instead of being hidden inside an uptime average.

## 24h proof

`PROVEN_24H` requires 24 consecutive certified UTC hours. Any uncertified or missing hour breaks the current streak.

The report is stored at:

`state/local-edge-lab-v086-soak-report.json`

Recent hourly evidence is stored at:

`state/local-edge-lab-v086-soak-hours.json`

## Inputs deliberately excluded

The worker does not read:

- Blind Exam files or results;
- prediction outcomes;
- win/loss or returns;
- scorecard performance metrics;
- profitability/EV;
- credentials or order state.

It only uses the v0.84 operations health gate and local cumulative pipeline counters.

## Windows overlay

The v0.86 overlay requires existing v0.84 and v0.85 installation receipts plus current v0.84 health PASS. It stages and tests the soak code before copying two files into the runtime and registering:

`VoiceTrader-LocalNode-SoakCertifier`

The task starts immediately and at Windows startup, with restart-on-failure. Overlay failure restores prior v0.86 files/task and leaves existing research data and workers intact.

## Safety

Always false:

- cloud upload
- prediction authorization
- execution authorization
- order submission
- real-money routing
- profitability claim
- actual Net EV availability

A `PROVEN_24H` report proves continuous local evidence capture only. It never proves an edge.
