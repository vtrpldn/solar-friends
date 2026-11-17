---
description: Climate sources, weather generation, and watershed assumptions for the v2 simulation.
---
# Weather and water

## Why

A single weather sample drives the forecast, scene lighting, rainfall, and solar production. Water shortages then depend on stored reserves, extraction, and the season. One game day remains 3,200 simulation seconds.

## Climate references

The bundled January–December profiles use INMET 1991–2020 normals for São Paulo Mirante de Santana (83781), Brasília (83377), and Petrolina (82983). These represent particular climates within Mata Atlântica, Cerrado, and Caatinga; they do not describe every location in each biome. The [source extract](simulation-climate-sources.json) records table URLs, source-file SHA-256 hashes, station rows, and values. The tables are precipitation in mm/month, days/month with at least 1 mm precipitation, and mean compensated temperature in °C.

The source is [INMET's climate normals](https://portal.inmet.gov.br/normais). Values are bundled locally and gameplay never fetches weather. Months with rounded zero rainy days but positive precipitation use trace drizzle; this is an explicit interpolation assumption.

## Authored weather behavior

A hash of seed, absolute day, and model version determines weather. Shared three-day wet/dry draws create persistence. Wet days have one six-hour rain period, with total precipitation varying between half and one-and-a-half times the monthly mean per rainy day. Temperature uses a four-degree diurnal amplitude and a daily offset within two degrees of the monthly normal. Cloud cover and storm duration are gameplay assumptions, not observed hourly data.

Clouds reduce solar output by up to 75%. Forecasts show three calendar days, including today, with rainfall categories and temperature bands rounded outward to five degrees. Opening progress cannot start or stop weather. Save/reload and forecast inspection cannot reroll it.

## Authored watershed behavior

Each map shares one aquifer and one river reserve. Water abundance multiplies an aquifer capacity of 120,000 L and upstream supply of 8,000 L/day. Initial reserves and upstream supply also depend on the reference location's monthly rainfall relative to its wettest month.

An off-map 4,000 m² recharge catchment supplies delayed runoff with a two-day release time. Up to 60% of released runoff recharges the aquifer; groundwater discharges to the river with a 180-day time constant. The river discharges downstream with a one-day time constant. These dimensions and coefficients are game assumptions rather than a surveyed watershed. They represent land beyond the playable map, so plot rainfall and roof capture are separate inputs.

Wells share groundwater; pumps and manual river hauling share river water. Equipment throughput remains a separate limit. Hydropower scales with flow and does not consume water. Collection order is stable by infrastructure ID. This is deterministic allocation, not hydraulic pressure simulation.

Cistern catchment is 16 m² and a standalone barrel is 1 m². A collector can also claim the nearest completed roof within six cells; each roof belongs to at most one collector. Roof area uses its building footprint. Capture efficiency is 80%; rejected water and overflow enter delayed runoff. Accounts distinguish catchment rainfall, capture, overflow, recharge, baseflow, extraction, and downstream discharge.

## Checks

`verify-v02-realism-weather.mjs` compares generated monthly rainfall, rainy days, and temperature with the reference profiles over 1,000 synthetic years. `verify-v02-realism-water.mjs` runs a year across all nine biome/water combinations and checks conservation, competing extraction, delayed recharge, and unique roof ownership. These establish model behavior, not local hydrological accuracy.
