# Human Society

An agent-based simulation of a whole society that runs in your browser. Every dot on the map is a
person. Each one has a personality, beliefs, a faith, a family, friends, a job, savings, health, moods
and grievances. They are born, go to school, work, marry, have children, argue, protest, radicalize,
emigrate and die. One tick is one month.

You set the starting conditions: population, faith groups, values, economy, government, culture and
the trends pushed by media and the state. Then you watch history unfold and change it. The main
question it is built to answer is **which groups and ideologies grow, and why**: births and deaths,
age structure, people joining and leaving, marriage across group lines, and migration. You can
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
| `npm run groups -- <preset> [people] [years] [seed] [immigration or -] [calm]` | Which faith groups and ideology camps grow, every 5 years, with each group's fertility, age, schooling, wealth and flows per 1,000 (births, deaths, converts in and out, immigrants, emigrants). `calm` turns random events off. Example: `npm run groups -- modern 20000 25 1 0` |

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
- Start from a preset or a blank slate. Present-day presets use real countries' religious make-up and
  published projections to compare against: Western Europe, the United States, India, Nigeria,
  Israel, a Nordic welfare state, a young Arab autocracy (2010) and a devout South Asian society.
  Historical presets (1800 kingdom, 1900 industrializing nation, 1920s republic) are stylised.
- **Population**: size, age structure, urbanization, number of cities, schooling, health, wealth inequality.
- **Faith groups** (up to 8): pick a **real tradition in a region** (about 30 profiles: Christians in
  Western Europe, the US or Africa, Evangelicals, Catholics in Latin America, Muslims in the Middle
  East, South Asia, Europe or West Africa, Hindus, Sikhs, Buddhists, Jews in Israel or the diaspora,
  Haredi Jews, folk religions, the non-religious…) or build a custom group. A profile holds only
  measurable things that decide whether a group grows: religiosity, literal ↔ flexible reading,
  family size, age structure, how many members it keeps, how actively it gains converts, marriage
  within the group, schooling and wealth, each with its source (mostly Pew Research and national
  surveys). There are no character stereotypes, and tolerance starts equal: presets set it per country.
- **Personality & values**: the Big Five, empathy, aggression, social and economic values,
  authoritarianism, nationalism, materialism, trust.
- **Economy** and **government**: GDP per person, productivity growth, market freedom, taxes, welfare,
  schooling, healthcare, democracy, rule of law, press freedom, repression, army loyalty, gender
  equality, family-planning programmes, state religion policy, discrimination, and the ideology of
  the rulers.
- **Culture & trends**: collectivism, social media, and seven "trend" dials for sustained pressure
  from media, advertising, schools and the state (consumerism, patriotism, religion, liberalism,
  capitalism, authority, tolerance).
- **Scripted history**: schedule any event for any year before you begin.

**While it runs:**
- **Map**: colour people by any of about 30 lenses (faith, ideology camp, party, wealth, happiness,
  grievance, extremism, protest, love life, epidemic…). Zoom, pan, and click anyone to inspect them.
  Red rings mark protest hotspots.
- **Groups** (the default tab): who is growing fastest and why. Each group's share over time,
  children per woman, median age, and its yearly births − deaths, switching (joining − leaving) and
  migration per 1,000 members; a straight-line outlook ("if today's rates held, X would overtake Y
  around 2070"); and the six **ideology camps** (religious traditionalists, nationalists, secular
  progressives, socialists, market liberals, moderates) with their change since the start.
- **Politics**: regime, democracy, legitimacy, political stress, army loyalty, current events,
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
  intervention. It reports, for every group, its median share at the end with the range of
  outcomes, and the chance that it grows, becomes the largest group, wins a majority or overtakes
  today's largest group (and around when); the same for the ideology camps; the odds of revolution,
  coups, civil war and so on; and fan charts of every major indicator.
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
   Schooling delays marriage and first births; communities introduce their singles to each other
   (so small, close-knit groups can still marry within the group); a child's faith follows the
   parents, weighted by how firmly each parent's group keeps its members.
9. **Faith**: most switching happens between 15 and 35, at rates set by each group's retention,
   by how lukewarm the person is, and by how secular and individualist the society is. Leavers
   mostly become "nones" where that is socially possible; joining another faith needs a group that
   seeks converts. Views form in youth and then change slowly.

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

Faith groups can be real traditions, described only by measurable demographic tendencies with
sources. Nothing in the model makes any group violent or virtuous: extremism arises from grievance,
humiliation, discrimination, isolation and militant networks, and the same mechanism produces
religious, nationalist or revolutionary militants. Group growth comes out of individual lives
(who marries whom, how many children, who leaves or joins, who migrates), so a group's future can
change when schooling, wealth, cities, policy or events change; it is not fixed by its label.

**How the projections compare** (25-year runs, see `npm run groups`): Western Europe with no
migration, Muslims 6% → about 8.4% by 2050 (Pew 2017's zero-migration scenario implies ×1.5 over 34
years) and about 10–11% with medium migration (Pew: 11.2%); the non-religious keep growing. India,
Muslims 14.4% → 16–20% by 2050 depending on the run (Pew 2015: 18.4%). Israel, Haredi Jews 13% →
about 22% by 2050 (Israel CBS: about a quarter). Nigeria, Muslims 50% → about 53–54% (Pew: about
58%), because the simulated economy grows slowly and fertility stays high. In the United States the
non-religious grow and Christians decline more slowly than in Pew's 2022 scenarios.

## Project layout

```
src/sim/        the simulation (no DOM; runs in a worker or in Node)
  engine.ts     the monthly loop, economy, politics, events, statistics
  agents.ts     structure-of-arrays storage for millions of people
  events.ts     primitive effects + ~60 historical event templates
  config.ts     initial-condition types and defaults
  presets.ts    starting scenarios
  faiths.ts     real faith traditions by region, with sources
  politics.ts   emergent parties, naming, ideology helpers
  forecast.ts   Monte Carlo futures and what-if comparisons
  lens.ts       map colour schemes
  stats.ts      indicator definitions, Gini, life tables
  world.ts      cities (Zipf sizes), villages, names
src/worker/     the Web Worker host and message protocol
src/ui/         the app: WebGL map, charts, setup screen, panels, styles
scripts/        headless runner, robustness sweep, and groups.ts (who grows, with reasons)
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
