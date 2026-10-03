# Human Society

An agent-based simulation of a whole society that runs in your browser. Every dot on the map is a
person. Each one has a personality, beliefs, a faith, a family, friends, a job, savings, health, moods
and grievances. They are born, go to school, work, marry, have children, argue, protest, radicalize,
emigrate and die. One tick is one month.

You set the starting conditions: population, faith groups, values, economy, government, culture and
the trends pushed by media and the state. Then you watch history unfold and change it. You can
trigger or schedule events drawn from real history, compose any event of your own, spawn
influential people, change policy, and run Monte Carlo forecasts that compare possible futures
with and without an intervention.

> One person is unpredictable; a population is not. The model follows that intuition. Individuals
> make noisy, personal choices, and the aggregates (fertility, unemployment, polarization, protest
> waves, regime change) move in ways that published research on societies would recognize.

## Running it

```bash
npm install
npm run dev            # open the printed http://localhost:5173 URL
```

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Production build into `dist/` (a static site you can host anywhere) |
| `npm run build:single` | One self-contained HTML file in `dist-single/` (works offline) |
| `npm run typecheck` | TypeScript checks |
| `npm run headless -- <preset> <people> <years> <seed>` | Run without the UI and print yearly indicators, e.g. `npm run headless -- fragileDemocracy 20000 30 4` |
| `npm run sweep -- [preset\|all] [people] [years] [seeds]` | Robustness sweep over presets and seeds: ranges of key indicators, NaN checks, headline events |

The simulation runs in a Web Worker, so the page stays responsive. People are drawn with WebGL2 as
GPU point sprites (one draw call for millions of dots), with a CPU fallback if WebGL2 is missing.

### How big can it get?

People are stored as a *structure of arrays*: about 150 bytes each, so one million people take
about 150 MB. Neighbours, families and friends are re-sorted to sit together in memory once a
simulated year, which keeps the random social contacts cache-friendly.

On a typical laptop, expect roughly 0.7–1 µs of CPU per person per simulated month:

| People | Months per second (approx.) |
|---|---|
| 50,000 | 20–30 |
| 250,000 | 4–6 |
| 1,000,000 | ~1 |
| 3,000,000 | one month every ~3 s |

Large populations look spectacular and are statistically smoother, but most dynamics are already
visible at 50k–200k people. Forecasts always use a representative sample (3k–60k people, with
families kept together), so they stay fast whatever the main population is.

## What you can do

**Set up a society** (the first screen):
- Start from a preset (pre-industrial kingdom, industrializing nation, fragile 1920s-style democracy,
  young autocracy, modern democracy, secular welfare state, devout traditional society, divided
  society) or a blank slate. Presets are only slider values; none of them is a real country.
- **Population**: size, age structure, urbanization, number of cities, schooling, health, wealth inequality.
- **Faith groups** (up to 6): you name them and set each one's size, religiosity, strict ↔ flexible
  interpretation and tolerance. A group can be marked "no religion".
- **Personality & values**: the Big Five, empathy, aggression, social and economic values,
  authoritarianism, nationalism, materialism, trust.
- **Economy** and **government**: GDP per person, productivity growth, market freedom, taxes, welfare,
  schooling, healthcare, democracy, rule of law, press freedom, repression, army loyalty, gender
  equality, state religion policy, discrimination, and the ideology of the rulers.
- **Culture & trends**: collectivism, social media, and seven "trend" dials for sustained pressure
  from media, advertising, schools and the state (consumerism, patriotism, religion, liberalism,
  capitalism, authority, tolerance).
- **Scripted history**: schedule any event for any year before you begin.

**While it runs:**
- **Map**: colour people by any of about 30 lenses (faith, party, wealth, happiness, grievance,
  extremism, protest, love life, epidemic…). Zoom, pan, and click anyone to inspect them. Red rings
  mark protest hotspots.
- **Overview**: regime, democracy, legitimacy, political stress, army loyalty, current events,
  influential people, polls or hidden sympathies, faith communities, occupations, causes of death.
- **Trends**: charts for population, economy, wellbeing, values, faith and politics, plus a
  population pyramid and an opinion map with the party positions.
- **Events**: about 60 historically grounded templates with descriptions, the historical episodes
  behind them and sources. Scale the intensity, aim it at a faith group, a place, an age group or a
  class, then trigger it now or schedule it. Or **build your own** from ~50 primitive effects.
- **Policy**: change institutions, the economy and social policy live, or let elected governments
  and regimes pursue their own agendas.
- **People**: a person's traits, beliefs, wellbeing, family tree and friends. "Follow" them to record
  their life story.
- **Forecast**: run 4–40 possible futures from today's society, with an optional "what if"
  intervention, and compare the odds of revolution, coups, civil war, democracy and so on, plus
  fan charts of every major indicator.
- **News**: a chronicle of everything notable.

## How it works (short version)

Each month, for every person:

1. **Survival**: Gompertz–Makeham mortality whose level depends on the era's medical technology ×
   access to care, plus individual health, war, famine, epidemics and violence.
2. **Life course**: school transitions (shaped by access, ability, family wealth, gender norms),
   work, unemployment, entrepreneurship, rising into the elite, retirement, leaving home.
3. **Economy**: wages come from the output the society actually produces (with diminishing returns
   to land in farming societies, which is the Malthusian trap), plus capital income, taxes, welfare,
   consumption, savings, debt and inheritance.
4. **Social contacts**: one to three encounters with family, friends and neighbours. Opinions move by
   *bounded confidence* (people listen to those not too different from them), moods are contagious,
   friendships form by similarity, and romance and marriage depend on attraction, compatibility and
   (for interfaith couples) on tolerance and community pressure.
5. **Norms and media**: conformity to the neighbourhood, social approval, media trends, state
   propaganda, social-media echo chambers, and charismatic leaders.
6. **Psychology**: life satisfaction, mood, mental health, self-image (from inferiority to
   superiority complex), grievance (relative deprivation, injustice, repression, lack of voice) and fear.
7. **Collective behaviour**: protest via Granovetter threshold cascades, crime, and radicalization
   via need × narrative × network (Kruglanski), which can end in terrorism and backlash.
8. **Family**: partnership bonds, divorce, and births from desired family size and contraception.

Then the society reacts: elections (parties emerge from clustering voters), coalitions, policy
drift, democratic backsliding or consolidation, revolutions (the 3.5% rule, army defections), coups,
civil wars, debt crises, and random events whose odds depend on current conditions.

The complete list of mechanisms, with sources, is in **[docs/MODEL.md](docs/MODEL.md)**.

## A note on interpretation

This is a model, and all models are wrong; some are useful. The mechanisms come from published
research, and the magnitudes are calibrated so the outputs look like the real world (life
expectancy, fertility, inequality, unemployment, crime and suicide rates in plausible ranges). The
simulation is still a simplification, and individual runs are one possible history, not a
prophecy. Use the Forecast tab to see the distribution of outcomes, and treat the patterns (what
makes revolutions or radicalization more or less likely) as more reliable than any single number.

Faith is modelled with abstract dials (religiosity, interpretation, tolerance) and groups you name.
No real religion is hard-coded, and nothing in the model makes any group violent. Extremism arises
from grievance, humiliation, discrimination, isolation and militant networks, and the same
mechanism produces religious, nationalist or revolutionary militants.

## Project layout

```
src/sim/        the simulation (no DOM; runs in a worker or in Node)
  engine.ts     the monthly loop, economy, politics, events, statistics
  agents.ts     structure-of-arrays storage for millions of people
  events.ts     primitive effects + ~60 historical event templates
  config.ts     initial-condition types and defaults
  presets.ts    starting scenarios
  politics.ts   emergent parties, naming, ideology helpers
  forecast.ts   Monte Carlo futures and what-if comparisons
  lens.ts       map colour schemes
  stats.ts      indicator definitions, Gini, life tables
  world.ts      cities (Zipf sizes), villages, names
src/worker/     the Web Worker host and message protocol
src/ui/         the app: WebGL map, charts, setup screen, panels, styles
scripts/        headless runner for experiments and calibration
docs/MODEL.md   the model, mechanism by mechanism, with references
```

## Roadmap ideas

- **Multi-core simulation**: split people across several workers with `SharedArrayBuffer` (needs a
  cross-origin-isolated host) for 3–4× faster million-person runs; or move the continuous updates
  (moods, opinions, health) to WebGPU compute.
- **Several countries**: trade, migration and war between simulated societies.
- **Calibration against data**: fit parameters to World Values Survey, World Bank and V-Dem
  series, and back-test historical episodes.
- **Scenario sharing**: save and load scenarios and timelines as files or links.
- **Richer institutions**: courts, a parliament with seats, local government, unions, religious
  institutions as organizations.
