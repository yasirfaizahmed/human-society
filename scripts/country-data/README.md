# Real-country data

`src/sim/countryData.ts` is generated from three inputs:

1. **Machine-readable sources**, downloaded from the official R data packages on GitHub by
   `extract.py` (needs `pip install rdata pandas`):
   - UN **World Population Prospects 2024** (`PPgp/wpp2024`): 2026 population by single year of
     age, fertility, life expectancy, net migration and growth (medium variant).
   - **V-Dem v16** and **V-Party** (`vdeminstitute/vdemdata`): 2025 democracy, rule of law,
     free expression, repression, women's empowerment, polarization, exclusion of social groups,
     religious freedom, state ownership and property rights; party positions of the electorate
     and of governing parties.
   The extracted numbers are kept in `.cache/*.json` (the large downloads are not committed).
2. **Hand-researched values** in `manual.py`, each with its source: IMF World Economic Outlook
   (April 2026), World Bank, UNDP Human Development Report 2025, Freedom House 2026, Pew Research
   Center (religious composition, religiosity, values, trust), national censuses and statistics
   offices, DataReportal, UBS, SIPRI, OECD, ILO, Hofstede, and who governs as of the compilation date.
3. `build.py` combines both into `src/sim/countryData.ts`.

Then `npm run fit-countries` calibrates the few settings that have no direct measure (family-size
norm, health access, schooling of young adults, productivity growth, migration openness) so the
simulation reproduces each country's observed fertility, life expectancy, schooling, growth and
net migration, and writes `src/sim/countryFit.ts`.

To refresh: update `manual.py` (and the year in `extract.py` if needed), run
`python3 scripts/country-data/extract.py`, `python3 scripts/country-data/build.py`, then
`npm run fit-countries`.
