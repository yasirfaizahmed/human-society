# The model

This document explains every mechanism in the simulation, why it is there, and where it comes from.
The code that implements each section lives in `src/sim/engine.ts` unless noted otherwise.

**Design principle.** Individuals follow simple, noisy, *plausible* rules drawn from psychology,
sociology, demography and economics. Nothing at the society level is scripted: fertility, inequality,
polarization, protest waves, parties, regime change and secularization all *emerge* from the rules plus
the conditions and events you choose. Magnitudes are calibrated so outputs fall in realistic ranges
(see "Calibration" at the end).

---

## 1. People

Each person (one "agent") carries:

| Group | Attributes |
|---|---|
| Identity | sex, birth month, faith group, home settlement, position |
| Personality (fixed, partly inherited) | Big Five: openness, conscientiousness, extraversion, agreeableness, neuroticism; cognitive ability ("thinking capacity"), empathy, aggression, appearance |
| Beliefs (change over life) | religiosity, strict ↔ flexible interpretation, tolerance of out-groups, social liberalism, economic views, desire for a strong leader, nationalism, consumerism, trust in institutions, trust in people, extremism |
| Wellbeing | physical health, mental health, mood, life satisfaction, self-image (−1 inferiority … +1 superiority), grievance, fear |
| Life | years of schooling, occupation, income, wealth, partner and bond strength, mother, father, number of children, four friends, protest state, criminal record, infection state |

Personality is inherited with heritability ≈ 0.4–0.5 (child = mix of parents and population mean +
noise), consistent with twin studies (Bouchard & McGue 2003; Polderman et al. 2015, *Nature Genetics*).
Political and religious attitudes are *transmitted* (children start near their parents and are pulled
toward them while young), which matches findings that parents are the strongest single influence on
religion and party (Jennings, Stoker & Bowers 2009; Bengtson 2013, *Families and Faith*).

Storage is a structure of arrays (`agents.ts`). References between people are packed as
`slot × 256 + generation`, so links to the dead are detected rather than pointing at strangers.

## 2. Geography

Cities have Zipf-distributed sizes (Gabaix 1999), with a capital near the centre and about 70 villages
in the countryside. Minority faith groups get a "heartland" region they are more likely to live in, as
in most real countries. The territory is a 160 × 100 grid; people in the same cell are neighbours.
Once a year, people are physically re-sorted by cell for speed.

When people move (leaving home, marriage, urbanization, divorce) they choose among a few candidate
homes, preferring neighbourhoods with their own group (stronger for the intolerant and devout, and
for minorities under threat) and with people of similar wealth. This is Schelling's (1971) segregation
mechanism, so mild preferences can produce strong residential sorting.

## 3. Demography

**Mortality.** Adult mortality follows Gompertz–Makeham, μ(a) = A + B·e^{0.088a}, plus a child-mortality
term for ages 0–4. A and B depend on **healthcare quality H**:

H = 0.08 + 0.88 · medicalTechnology(year) · access^0.7,
medicalTechnology = logistic curve centred on 1905, access = f(GDP per person, health spending).

This reproduces the Preston curve (Preston 1975) *and* its shift over time: a poor country today lives
far longer than a rich one in 1850 (Cutler, Deaton & Lleras-Muney 2006; Riley 2001). Calibrated life
expectancy at birth is about 31 pre-industrially, 47 in 1900 Western Europe, 59 in the 1920s, 62 in a
poor country today, 73 in a middle-income country and 83–85 in a rich one.
Individually, poor health raises risk (frailty multiplier), men face 25% higher adult mortality, and
deaths can come from epidemics, war, violence, famine, repression or suicide.

**Fertility** follows the proximate-determinants logic (Bongaarts 1978). Each woman has a
*desired family size*, which rises with religiosity, traditional values, child mortality (replacement),
collectivism and farming, falls with her schooling, and is shifted by her group's family-size norm
(the profile's *fertility*). Each woman's own threshold is desired − U(0, 1), so completed families
average exactly the desired size. Natural fertility (about 0.62 conceptions a year at peak, about
34-month birth spacing) applies until she reaches it, slowed a little where couples space births with
birth control; after that, births happen only as far as contraception fails.

Birth-control use follows development (an S-curve: low in poor farming societies, near universal in rich
ones), women's status and her own schooling; doctrines against it hold back the devout and literal,
and pronatalist groups use less of it. **Family-planning programmes** (a society setting) reach women
without schooling too and pull larger desired families down toward a two-child norm, not below
(India since 1952, Bangladesh, Iran after 1989). Schooling postpones partnership (women at about
15 + 0.75 × years of school) and the first birth, except in devout communities that keep early marriage
as a norm. This gives total fertility of about 5–6 in poor farming societies, 2–2.5 in middle-income
ones with family planning and 1.3–1.8 in rich ones, with religious groups keeping higher fertility
(Pew 2015; Kaufmann 2010). Female education is the strongest single predictor of falling fertility
(Lutz & KC 2011).

**Marriage.** Singles meet partners among their contacts. The chance of marriage rises with
attraction, similar education and values, the other person's kindness and empathy, age-appropriate
urgency, and collectivism (earlier, family-backed matches). Interfaith matches are blocked in proportion
to the stronger of the two groups' endogamy (scaled by devotion) and to religiosity × intolerance ×
community pressure. **Matchmaking**: families and congregations keep a "board" of their single
adults and introduce them across town, more often the scarcer the group is locally and the more it
marries within itself; without this, small endogamous minorities could not find partners and would
shrink for the wrong reason. Interfaith marriages can lead the less devout partner to convert, more
often when the partner's group gains converts and the convert's group keeps members weakly.
A child of a mixed couple usually takes the father's faith where custom is patrilineal (collectivism),
weighted by how firmly each parent's group keeps its members. **Divorce** risk rises when the bond is weak and is scaled by how accepted divorce is
(social liberalism, low religiosity, individualism, women's rights). Bonds strengthen with
agreeableness and shared values and weaken with poverty, unemployment and an aggressive partner.

**Inheritance.** A partner inherits; otherwise children share the estate.

**Migration.** Rural young people move to cities while the urban share is below what the economy's
level of development supports. Emigration rises with unhappiness, education, openness, fear, war and
discrimination (brain drain: Docquier & Rapoport 2012). Immigrants and refugees arrive through events,
with their own faith, education and wealth profile.

**Faith switching.** Most religious change happens between 15 and 35 (Pew 2022, *Modeling the Future of
Religion in America*). Once a year, a young adult leaves their group with probability
0.045 × (1 − retention) × (lukewarmness relative to the group) × (secularism of society) × (freedom:
apostasy is rare under theocracy and in tight collectivist societies); much less after 35. Leavers
mostly become "nones" where a non-religious group exists and values are liberal; otherwise they join
another faith, which needs a group that seeks converts (*outreach*). The non-religious join a faith
at the matching rate, usually their partner's or parents', or the most present and active group
around them. Devout friends of another faith can also persuade. Every switch is counted in the
group flows the Groups tab shows.

### Faith profiles (`faiths.ts`)

A group can take its starting values from a **profile**: a real tradition in a region (about 30:
Christianity in Western Europe, the US, Latin America, Africa, the Middle East and South Asia;
Evangelicals; Islam in the Middle East, South Asia, South-East Asia, Europe, the US and West Africa;
Hinduism in India and the diaspora; Sikhism; Buddhism in East and South-East Asia; Judaism in
Israel, the diaspora and Haredi communities; folk religions; the non-religious in the West and East
Asia; and historical versions). A profile sets religiosity, literal ↔ flexible interpretation,
family-size norm, retention, outreach, endogamy, schooling and wealth relative to the national
average, and age structure, each with its source (Pew Research reports, national censuses and
surveys such as NFHS-5 and the Nigeria DHS). Profiles carry no character traits: honesty,
aggression or intelligence by religion are not supported by evidence, and violence in the model
comes only from grievance, humiliation and networks. Tolerance starts equal for every profile,
because measured intergroup tolerance depends mostly on the country and its history; presets set
it per country.

**Group norms.** A close-knit group is its members' main reference group: conformity pulls a member's
devotion toward the group's norm (half its current mean, half its tradition), and social views partly
toward the group's mean, in proportion to the group's endogamy.

## 4. Education and work

Children start school with a probability that depends on access, family wealth and gender norms.
At each transition (primary → lower secondary → upper secondary → university → postgraduate),
continuing depends on access, development, ability, conscientiousness, parental wealth (social
mobility) and, for girls, gender equality.

School leavers look for work. Each month workers can lose their job, and job-seekers find one with a
probability set so that unemployment gravitates toward its target. The target is a natural rate,
plus the business cycle (Okun's law: 1% of output gap ≈ 0.5 points of unemployment), plus event
shocks and recent automation. Job-finding is lower for less employable people, for minorities under
discrimination, for those with a criminal record, and for women where gender equality is low.
Jobs come in tiers (manual, skilled, professional) by schooling and ability. Some people start
businesses, especially open, emotionally stable people with savings in free-market economies.
Businesses can fail.

**Elites and frustrated graduates.** About 1–2% of adults hold elite positions. Highly educated people
without an elite or professional job become "frustrated graduates", which feeds grievance. This is
Turchin's *elite overproduction* (Turchin 2016; Goldstone 1991).

## 5. Economy

Output per month = productivity × effective labour (sum of workers' skills) × land factor ×
(1 + output gap). The land factor has diminishing returns in farming economies: more workers on the
same land produce less per person. Combined with poverty-driven mortality, this yields **Malthusian
dynamics** in agrarian presets: population pressure lowers living standards, and plagues raise
survivors' wages (Clark 2007; Jedwab, Johnson & Koyama 2022).

**Growth.** Productivity grows at the frontier rate you set × institution quality (rule of law,
balanced markets, low repression: Acemoglu & Robinson 2012), plus *conditional catch-up* for poorer
societies with decent institutions and schooling (Barro 1991), minus conflict, plus event effects
(industrial revolution, automation, inventors).

**Incomes.** Labour receives (1 − capital share) of output, distributed by skill (occupation tier,
ability, schooling, a persistent personal "luck" factor), with gaps for women and discriminated
minorities. Automation compresses routine wages (Autor 2015; Acemoglu & Restrepo 2020).
Capital income goes to wealth holders, with returns rising with wealth (Fagereng et al. 2020), which
lets r > g concentrate wealth (Piketty 2014). Taxes are progressive by your setting. Welfare pays the
unemployed, pensioners and the poorest.

**Spending and saving.** The poor spend nearly all their income, the rich save more (the marginal
propensity to consume falls with income), and materialism and low conscientiousness raise spending.
Households pool wealth. Debt is limited by credit availability.

**Inflation** follows the output gap, war and money printing when debt is high and institutions weak.
High inflation erodes ordinary people's savings more than owners' real assets, cuts real wages and
erodes the real value of public debt. **Public finances**: taxes in, transfers and public services
(schools, health, army, police) out. Debt above 220% of GDP triggers a default and a debt crisis.

Reported **inequality** (Gini of household income per adult, Gini of wealth, top-10% wealth share)
and **poverty** (relative: below 50% of the median; extreme: below $2.15 a day) are computed from a
4,096-person sample each month.

## 6. Social influence

Each month a person has 1–3 meaningful encounters, more for extraverts and city dwellers: with a
partner, parent, friend, neighbour, co-worker or, occasionally, a stranger from far away (small-world
ties: Watts & Strogatz 1998).

**Opinion dynamics: bounded confidence.** You are influenced by someone only if their views are within
your "confidence radius", which is wider for open and tolerant people (Deffuant et al. 2000;
Hegselmann & Krause 2002). Influence is stronger from close ties and from prestigious people (higher
status, extraverts, public figures: prestige bias, Henrich & Gil-White 2001). Susceptibility peaks in
youth and falls with age (the impressionable-years hypothesis, Krosnick & Alwin 1989). Very
disagreeable people confronted with very different views can move away from them (a weak boomerang
effect; Bail et al. 2018 found it on social media, while Wood & Porter 2019 found it is rare in general).

**Intergroup contact.** Cooperative contact with people of another faith raises tolerance; hostile
contact lowers it (Allport 1954; Pettigrew & Tropp 2006 meta-analysis; Mousa 2020).

**Emotional contagion.** Moods spread through ties (Fowler & Christakis 2008).

**Friendship** forms by similarity in age and values (homophily: McPherson, Smith-Lovin & Cook 2001).

**Norms and social approval.** People drift toward their neighbourhood's average values, more in
collectivist societies and more for less open people (Asch 1956; Hofstede 2001). Deviating from local
norms costs life satisfaction in proportion to collectivism. This is the "social approval" force.

**Formative views.** Social influence alone would make everyone agree eventually. In real societies
views stay diverse because they are rooted in personality and position and settle in youth. Until 25,
social, economic, authority and national views lean toward the group's norm plus personal anchors
(openness → liberal social views; conscientiousness, wealth → conservative and pro-market views:
Gerber et al. 2010; plus an idiosyncratic component); at 25 they are stored as *core views*, and
adults are pulled back toward them (impressionable years: Krosnick & Alwin 1989; Ghitza & Gelman
2014). Small random noise keeps a spread (Mäs, Flache & Helbing 2010). Society-wide change therefore
comes mostly through generational replacement, as Inglehart (1977) described.

**Ideology camps.** Each adult is placed in the camp they lean to most: religious traditionalists
(devout and socially conservative), nationalists (national pride and a wish for a strong leader),
secular progressives, socialists, market liberals, or moderates when no leaning is strong. A camp
defined by two views scores the weaker of the two.

**Media and trends.** Sustained pushes (consumerism, patriotism, religion, liberalism, capitalism,
authority, tolerance) reach people according to literacy, city life and development.
**State propaganda** pulls the receptive (those who trust institutions) toward the rulers' ideology,
in proportion to press censorship. Radio era: Adena et al. 2015; Rwanda: Yanagizawa-Drott 2014.
**Social media** users drift away from the population mean on social and economic issues (echo
chambers), feel slightly more outrage and anxiety, and grow slightly less tolerant. These effects are
kept small because the evidence is mixed (Allcott et al. 2020; Haidt & Twenge's claims are contested).

**Charismatic leaders** (spawned by events) influence those they reach whose views are close enough.
Aggrieved people are more receptive to demagogues, extremists and revolutionaries. Each style has its
own effects:

| Style | Effects on receptive people |
|---|---|
| Demagogue | stokes grievance, nationalism and the wish for a strongman; frightens minorities; hardens opponents; in office, accelerates backsliding |
| Reformer | in office, builds trust in institutions |
| Peacemaker | lowers extremism and fear; turns rioters into peaceful protesters |
| Spiritual teacher | revives faith in their own group; less consumerism, better mental health; interpretation follows their teaching |
| Extremist recruiter | pulls aggrieved young people in their area into militancy |
| Revolutionary | lowers the bar for joining protests |
| Visionary | raises productivity growth and consumer culture |

Leaders can join parties, win elections, take power after revolutions, and be assassinated, which
creates martyrs. This lets you test "great person" versus structural explanations of history
(Jones & Olken 2005 found that leaders measurably change growth).

## 7. Psychology

- **Life satisfaction** rises with relative status, income above subsistence, health, mental health, a
  good partnership, friends, a faith community, trust, freedom (for those who value it) and
  extraversion. It falls with unemployment (one of the largest effects in the literature: Clark & Oswald
  1994), fear, grievance, social disapproval, discrimination and neuroticism. People adapt slowly toward
  their target, so personality sets a baseline (Lykken & Tellegen 1996; World Happiness Report).
- **Mental health** follows life satisfaction, isolation, fear, poverty, healthcare and trauma.
  **Suicide** risk rises steeply as mental health collapses. It is higher for men and lower with
  faith, family and good healthcare (Durkheim 1897; VanderWeele et al. 2016).
- **Self-image** combines status, appearance, schooling, neuroticism (−), extraversion versus
  agreeableness (narcissism), mood, unemployment and discrimination. Strongly negative values are
  an inferiority complex; strongly positive ones a superiority complex.
- **Grievance** builds from relative deprivation (aspirations, which rise with education, versus
  attainment: Gurr 1970), unemployment, discrimination, distrust, inequality (felt more by those who
  dislike it), humiliation, frustrated elite ambitions, poverty, repression, disagreement with the
  rulers, lack of political voice (for those who value freedom), corruption and the cost of living.
  Welfare softens it.
- **Fear** decays toward current threats: local crime, war, civil conflict, epidemics, repression,
  minority status.
- **Trust in institutions** drifts toward legitimacy, rule of law, agreement with the rulers and
  personal fortunes, faster where the press is free (people see reality).
- **Faith and existential security.** In the impressionable years, insecurity (poverty, fear, poor
  healthcare, weak welfare) slowly raises religiosity and security slowly lowers it, as does long
  schooling (Norris & Inglehart 2011). Parents and communities transmit faith. Low-religiosity
  members may leave for "no religion"; non-religious people who grow devout join the faith of their
  partner, parent or neighbourhood. Some convert through devout friends or marriage.

## 8. Collective behaviour

**Protest: threshold cascades.** People join a protest when the share of protesters they can see
(locally, among friends, and nationally if the press and social media make it visible) exceeds their
personal threshold (Granovetter 1978). Thresholds are lower for the aggrieved, extraverted and
those with low fear, and higher under repression and for those who like authority. A few activists
with near-zero thresholds start things; most need company. Because visibility matters, censorship
keeps people from knowing how many share their anger (preference falsification: Kuran 1991), and
social media can suddenly reveal it. Protest waves tire out over months.

**State response.** Democracies concede (grievance relief, early elections after sustained mass
protest). Autocracies repress: arrests and killings raise fear but also anger the victims' families
(the "paradox of repression"). When large, nonviolent protests persist, the army and police start to
waver. A regime falls when more than about 3.5% of adults are on the streets for three months and
loyalty breaks (Chenoweth & Stephan 2011, whose "3.5% rule" is an empirical regularity, not a law).
The new regime reflects the protesters: largely nonviolent, non-authoritarian movements tend to
democratize, while violent or militant ones produce new autocracies (theocratic, socialist or
nationalist depending on their values).

**Crime** (Gottfredson & Hirschi 1990: low self-control; Merton: strain; Shaw & McKay / Sampson:
social disorganization). Risk is highest for young men and rises with low conscientiousness,
aggression, poverty, unemployment, inequality (Fajnzylber, Lederman & Loayza 2002) and low social
trust. It falls with policing (deterrence), faith (a moderate effect: Baier & Wright 2001) and empathy.
Victims lose money or health, become afraid and trust less, and a small share of violent crimes are
homicides. Offenders may be imprisoned and then find jobs harder to get.

**Radicalization** follows the 3N model (Kruglanski et al. 2014; McCauley & Moskalenko 2008):
- **Need**: grievance, inferiority, isolation, being a young man, discrimination, repression.
- **Narrative**: an ideology that justifies violence. Strict interpretation × devotion × intolerance,
  nationalism × intolerance, or economic extremism × grievance. Piety alone is *not* a driver.
- **Network**: militant friends and family, and recruiters (Sageman 2004).

It is countered by empathy, agreeableness, a partner and children, a job and tolerance
(Hirschi's social bonds), and decays when needs are met. Prison exposure to militants radicalizes.
Militants with high aggression may commit **terror attacks**, which kill people, spread fear, cause a
rally effect, harden the security state, and bring a backlash against the attacker's whole group. That
backlash can feed the next round of grievance (reciprocal radicalization). A nationalist attack on a
minority instead frightens and angers the minority. Security services arrest militants in proportion
to effective policing.

**Civil war** starts when violent protest persists, and ends after a year of calm.

## 9. Politics

**Parties emerge.** Before each election, voters' positions (social, economic, authority, religion,
nationalism) are clustered with k-means into four parties. Platforms sit slightly outside their voters'
average (activists pull them outward) and follow voters over time (Downs 1957). Names are derived
from their platforms. People vote for the nearest party, with a penalty for the incumbent among
those who distrust institutions, a bonus for parties led by charismatic figures, and turnout rising
with trust, schooling and age. Coalitions form around the largest party with its nearest partners.

**Governments act.** If "Rulers set policy themselves" is on, policies drift over about four years
toward the ruling ideology: taxes, progressivity and welfare (left ↔ right), market freedom, gender
equality, military, policing, discrimination (nationalism × traditionalism), and state religion policy.
Democratic institutions constrain the press and the use of force.

**Regimes change.** Democracies erode when authoritarian rulers stay in power and institutions are
young or weak, especially under demagogues (Levitsky & Ziblatt 2018). They consolidate in rich,
educated societies with non-authoritarian rulers (Lipset 1959; Przeworski et al. 2000).
Coups strike poor, low-legitimacy, militarized regimes (Powell & Thyne 2011). Revolutions are
described above. After a regime change, hostile elites are purged and a honeymoon briefly lowers
protest.

**Legitimacy** = performance (growth, jobs, prices) + trust + democratic procedure + ideological
agreement + rule of law.

**Political stress index** (Turchin 2016, *Ages of Discord*) = mass mobilization potential
(grievance × urbanization × youth bulge) × elite mobilization potential (aspirants per elite position,
frustrated graduates) × state fiscal distress (debt × distrust). It raises the odds of protest
sparks and revolutionary organizers.

## 10. Events

Every event is **data**: a set of primitive effects with a duration, a time profile (sudden shock,
rise and fall, gradual build-up, constant, fading), an intensity and a target (faith group, place,
urban or rural, age range, sex, wealth class, or a random share). The primitives are:

- **Economy**: output shock, trend growth, inflation, unemployment, productivity, automation,
  capital share, wealth destroyed, wealth redistributed.
- **Institutions & policy**: democracy, rule of law, press freedom, repression, army loyalty, welfare,
  taxes, progressivity, market freedom, education, health, military, policing, gender equality,
  contraception, discrimination, social media, collectivism, propaganda reach.
- **Population**: extra deaths (with age profiles), epidemics (R₀, fatality rate, age profile:
  1918-style W shape, COVID-style exponential in age, or uniform), immigrants (with a profile),
  emigration, push to cities, war mobilization, protest spark, crime pressure.
- **Hearts & minds** (monthly pushes on the target group): grievance, fear, mood, health, mental
  health, trust, tolerance, nationalism, religiosity, interpretation, social values, economic views,
  authoritarianism, consumerism, extremism, and backlash against the target.
- **Special**: regime change (military, clerical, socialist, nationalist, monarchy, democratic) and
  influential people (style, charisma, reach, ideology).

The template library (`events.ts`) encodes about 60 episodes with their historical grounding and
sources: recessions, the Great Depression, financial crises, hyperinflation, debt crises, oil and food
price shocks, resource booms, austerity, market reforms, socialist turns, land reform, welfare
expansion, automation, the industrial revolution, the printing press, radio, social media,
contraception, schooling, healthcare, agricultural revolutions, coups and revolutions, backsliding,
stolen elections, scandals, sparks of outrage, reconciliation, civil rights, persecution,
scapegoating, wars, civil wars, occupation, independence, terror, assassinations, pandemics (1918,
COVID-like, Black Death), famine, deaths of despair, earthquakes, floods, droughts, refugee and labour
migration, brain drain, cultural revolutions, traditionalist backlash, sporting triumphs, religious
revivals, secularization, literalism, reform movements, and seven kinds of influential people.

**Random events** arise with base yearly rates scaled by current conditions. For example, famines
are far likelier in poor, warring, undemocratic societies (Sen 1981), coups in poor, low-legitimacy
ones, debt crises when debt is high, and demagogues when trust is low and times are hard. The
event-frequency slider scales them all, and you can switch them off.

## 11. Forecasts

`forecast.ts` exports a representative sample of today's society (households kept together, weights
scaled up), then simulates N independent futures with different random seeds. Each indicator,
each faith group's share and each ideology camp's share is summarized by its 10th, 50th and 90th
percentiles per year. Outcomes are the share of futures in which they happen: revolution, coup, civil
war, war, terror, recession, ending as a democracy or a dictatorship, population decline; and for
each group, growing its share, being the largest at the end, holding a majority, and overtaking
today's largest group (with the median year it happens). A *what-if* branch applies an intervention at the start and
uses the **same seeds** as the baseline, so differences come from the intervention rather than luck
(common random numbers).

## 12. Calibration

`scripts/headless.ts` runs any preset without the UI and prints yearly indicators. Target ranges
used during calibration:

| Indicator | Pre-industrial | Developing / middle-income | Rich |
|---|---|---|---|
| Life expectancy | 30–36 | 62–75 | 80–85 |
| Fertility (children per woman) | 4.5–6.5 | 2.5–4 | 1.4–1.9 |
| Crude birth / death rate (‰) | 35–40 / 25–32 | 20–30 / 5–10 | 9–12 / 9–11 |
| Unemployment | low (farm work) | 5–12% | 4–8% outside crises |
| Wealth Gini | 0.8+ | 0.65–0.8 | 0.6–0.75 |
| Income Gini | 0.45–0.55 | 0.4–0.5 | 0.28–0.36 |
| Recorded crime (per 1,000/yr) | 20–35 | 20–30 | 15–25 |
| Suicide (per 100,000/yr) | – | 5–15 | 5–15 |
| Extremists | ≈0 in content societies; 0.1–1% under persecution with militant networks |
| Protests | ≈0 in content democracies; waves of 1–10% under crises; >3.5% sustained can topple autocracies |

These are coarse ranges, not point estimates. The model is meant for exploring *mechanisms* and
*relative* effects of conditions and interventions.

**Group projections.** `scripts/groups.ts` prints each group's share every five years and its
fertility, median age, schooling, wealth and yearly flows. The present-day presets were tuned against
published projections; typical 25-year results (one run, 20,000 people):

| Preset | Simulated (2025 → 2050) | Published projection |
|---|---|---|
| Western Europe, no migration | Muslims 6.0% → 8.3–8.5%; non-religious 27% → 37% | Pew 2017 zero-migration: 4.9% → 7.4% (2016–2050) |
| Western Europe, medium migration | Muslims 6.0% → 9.7–10.4% | Pew 2017 medium: 11.2% by 2050 |
| India | Muslims 14.4% → 16–20%; TFR about 2 falling to 1.7 | Pew 2015: 18.4% by 2050; NFHS-5 TFR 1.94 (Hindu), 2.36 (Muslim) |
| Israel | Haredi 13% → 22%; TFR about 3 | Israel CBS: about a quarter by 2050 |
| Nigeria | Muslims 50% → 53%; TFR about 5.5 | Pew 2015: 58.5% by 2050 |
| United States | Christians 64% → 62%, non-religious 30% → 33% | Pew 2022: Christians 46–54% by 2070 |

Differences remain: Nigeria's simulated economy grows slowly, so its fertility stays high for both
groups and the gap between them is smaller than in the survey data; American switching out of
Christianity is slower than in Pew's scenarios.

## Known simplifications

- One country, no foreign actors. Wars are a mobilization, casualties and economic shock with a
  random outcome weighted by military strength.
- One tick is one month, so fast processes (epidemic generations, riots) are compressed.
- Households are approximated by partners pooling wealth and children living with their mother.
- Faith profiles are measurable tendencies, not doctrines: devotion, interpretation, family size,
  retention, outreach, endogamy, schooling, wealth and age. Group differences within a tradition
  (denominations, sects, ethnicity) appear only if you create them as separate groups.
- Party systems always have four clusters.
- Parameter values are chosen to match aggregate patterns and published effect directions. They are
  not estimated from any single dataset.

## References (selection)

Acemoglu & Robinson (2012) *Why Nations Fail* · Acemoglu & Restrepo (2020) Robots and Jobs, *JPE* ·
Adena et al. (2015) Radio and the Rise of the Nazis, *QJE* · Allcott et al. (2020) The Welfare Effects of
Social Media, *AER* · Allport (1954) *The Nature of Prejudice* · Asch (1956) · Autor (2015) *JEP* ·
Bail et al. (2018) *PNAS* · Baier & Wright (2001) *J. Research in Crime & Delinquency* · Barro (1991) *QJE* ·
Bengtson (2013) *Families and Faith* · Bongaarts (1978) *Population and Development Review* ·
Chenoweth & Stephan (2011) *Why Civil Resistance Works* · Clark (2007) *A Farewell to Alms* ·
Clark & Oswald (1994) *Economic Journal* · Cutler, Deaton & Lleras-Muney (2006) *JEP* ·
Deffuant et al. (2000) *Advances in Complex Systems* · Docquier & Rapoport (2012) *JEL* · Downs (1957) ·
Durkheim (1897) *Suicide* · Fagereng et al. (2020) *Econometrica* · Fajnzylber, Lederman & Loayza (2002) *J. Law & Economics* ·
Fowler & Christakis (2008) *BMJ* · Gerber et al. (2010) Personality and Political Attitudes, *APSR* · Ghitza & Gelman (2014) *The Great Society, Reagan's Revolution, and Generations of Presidential Voting* · Funke, Schularick & Trebesch (2016) *EER* · Gabaix (1999) *QJE* ·
Goldstone (1991) *Revolution and Rebellion* · Gottfredson & Hirschi (1990) · Granovetter (1978) *AJS* ·
Gurr (1970) *Why Men Rebel* · Hegselmann & Krause (2002) *JASSS* · Henrich & Gil-White (2001) *Evolution & Human Behavior* ·
Hofstede (2001) · Inglehart (1977) *The Silent Revolution* · Inglehart & Welzel (2005) · Jedwab, Johnson & Koyama (2022) *JEL* · Jones & Olken (2005) *QJE* ·
Kaufmann (2010) *Shall the Religious Inherit the Earth?* · Krosnick & Alwin (1989) *JPSP* · Kruglanski et al. (2014) *Political Psychology* ·
Kuran (1991) *World Politics* · Levitsky & Ziblatt (2018) · Lipset (1959) *APSR* · Lutz & KC (2011) *Science* · Mäs, Flache & Helbing (2010) *PLoS Comput. Biol.* ·
McCauley & Moskalenko (2008) *Terrorism & Political Violence* · McPherson et al. (2001) *Annual Review of Sociology* ·
Mousa (2020) *Science* · Norris & Inglehart (2011) *Sacred and Secular*; (2019) *Cultural Backlash* · Pape (2005) *Dying to Win* ·
Pettigrew & Tropp (2006) *JPSP* · Pew Research Center (2015) *The Future of World Religions*; (2017) *Europe's Growing Muslim Population*; (2021) *Religion in India*; (2022) *Modeling the Future of Religion in America* · Piketty (2014) · Powell & Thyne (2011) *JPR* · Preston (1975) *Population Studies* ·
Przeworski et al. (2000) · Reinhart & Rogoff (2009) · Riley (2001) *Rising Life Expectancy* · Sageman (2004) ·
Schelling (1971) *J. Mathematical Sociology* · Sen (1981) *Poverty and Famines* · Turchin (2016) *Ages of Discord* ·
VanderWeele et al. (2016) *JAMA Psychiatry* · Watts & Strogatz (1998) *Nature* · Wood & Porter (2019) *Political Behavior* ·
Yanagizawa-Drott (2014) *QJE*.
