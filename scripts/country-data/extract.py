"""Download and extract the machine-readable sources for the real-country data.

  * UN World Population Prospects 2024 (wpp2024 R package, PPgp/wpp2024 on GitHub): 2026 medium-variant
    population by single age, TFR, life expectancy, net migration and growth.
  * V-Dem v16 and V-Party (vdemdata R package, vdeminstitute/vdemdata on GitHub): 2025 governance indices,
    party positions of governing parties and the electorate.

Usage:  python3 scripts/country-data/extract.py      (needs: pip install rdata pandas)
Writes  scripts/country-data/.cache/{wpp2026,vdem2025,govideo}.json, then run build.py.
"""
import json, os, urllib.request, warnings
from math import erf, sqrt
import numpy as np
import pandas as pd
import rdata

warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache')
os.makedirs(CACHE, exist_ok=True)
WPP = 'https://raw.githubusercontent.com/PPgp/wpp2024/main/data/'
VDEM = 'https://raw.githubusercontent.com/vdeminstitute/vdemdata/master/data/'

def fetch(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print('downloading', url)
        urllib.request.urlretrieve(url, path)
    return path

def load(path):
    return list(rdata.read_rda(path).values())[0]

# ISO numeric codes (UN) and V-Dem / V-Party country names
COUNTRIES = {
    'India': (356, 'India', 'India'), 'Pakistan': (586, 'Pakistan', 'Pakistan'), 'Bangladesh': (50, 'Bangladesh', 'Bangladesh'),
    'Indonesia': (360, 'Indonesia', 'Indonesia'), 'Nigeria': (566, 'Nigeria', 'Nigeria'), 'Egypt': (818, 'Egypt', 'Egypt'),
    'Turkey': (792, 'Türkiye', 'Turkey'), 'United States': (840, 'United States of America', 'United States of America'),
    'United Kingdom': (826, 'United Kingdom', 'United Kingdom'), 'Germany': (276, 'Germany', 'Germany'), 'France': (250, 'France', 'France'),
    'Israel': (376, 'Israel', 'Israel'), 'Brazil': (76, 'Brazil', 'Brazil'),
}
# governing parties as named in V-Party (positions as last coded)
GOVERNING = {'India': ['BJP'], 'Pakistan': ['PML(N)'], 'Bangladesh': ['BNP'], 'Indonesia': ['Gerindra'], 'Nigeria': ['APC'], 'Egypt': ['NFP'],
             'Turkey': ["People's All..."], 'United States': ['Rep'], 'United Kingdom': ['Lab'], 'Germany': ['CDU', 'SPD'], 'France': ['LaREM'],
             'Israel': ['L'], 'Brazil': ['PT']}
YEAR = 2026

def wpp():
    tables = {n: load(fetch(WPP + n + '.rda', n + '.rda')) for n in ['tfrproj1dt', 'e0proj1dt', 'miscproj1dt', 'migproj1dt', 'popprojAge1dt']}
    for d in tables.values():
        d['year'] = d['year'].astype(int); d['country_code'] = d['country_code'].astype(int)
    tables['popprojAge1dt']['age'] = tables['popprojAge1dt']['age'].astype(int)
    out = {}
    for name, (code, _, _) in COUNTRIES.items():
        sel = lambda d: d[(d.country_code == code) & (d.year == YEAR)]
        p = sel(tables['popprojAge1dt']).sort_values('age')
        vals = p['popM'].astype(float).values + p['popF'].astype(float).values
        ages = p['age'].values
        tot = vals.sum(); cum = np.cumsum(vals); half = tot / 2
        i = int(np.searchsorted(cum, half)); prev = cum[i - 1] if i else 0
        m = sel(tables['miscproj1dt'])
        out[name] = dict(
            pop_m=round(tot / 1000, 2), tfr=round(float(sel(tables['tfrproj1dt']).tfr.values[0]), 2),
            e0=round(float(sel(tables['e0proj1dt']).e0B.values[0]), 1), median=round(float(ages[i] + (half - prev) / vals[i]), 1),
            cnmr=round(float(m.cnmr.values[0]), 2), growthrate=round(float(m.growthrate.values[0]), 2),
            bands=[float(vals[(ages >= a) & (ages < a + 5)].sum() / tot) for a in range(0, 100, 5)] + [float(vals[ages >= 100].sum() / tot)],
        )
    json.dump(out, open(os.path.join(CACHE, 'wpp2026.json'), 'w'), indent=1)

def vdem():
    vd = load(fetch(VDEM + 'vdem.RData', 'vdem.RData'))
    vp = load(fetch(VDEM + 'vparty.RData', 'vparty.RData'))
    out, gov = {}, {}
    for name, (_, vname, pname) in COUNTRIES.items():
        s = vd[vd.country_name == vname]
        r = s[s.year == 2025]
        g = lambda c: round(float(r[c].values[0]), 3)
        e = s[s['v2xpe_exlsocgr'].notna()].sort_values('year').tail(1)
        o = {c: g(c) for c in ['v2x_polyarchy', 'v2x_rule', 'v2x_freexp_altinf', 'v2x_clphy', 'v2x_clpol', 'v2x_gender', 'v2cacamps', 'v2clrelig', 'v2clstown', 'v2xcl_prpty']}
        o['v2xpe_exlsocgr'] = round(float(e['v2xpe_exlsocgr'].values[0]), 3)
        p = vp[vp.country_name == (pname if name != 'Turkey' else 'Turkey')]
        ly = p.year.max(); p = p[p.year == ly].copy()
        w = p['v2pavote'].astype(float)
        if w.isna().all(): w = p['v2paseatshare'].astype(float)
        p['w'] = w.fillna(0); p = p[p['v2pariglef_osp'].notna() & (p.w > 0)]
        W = p.w.sum(); wm = lambda c: float((p[c].astype(float) * p.w).sum() / W)
        o.update(vparty_year=int(ly), elect_econ=round(wm('v2pariglef_osp') / 6, 3), elect_auth=round(1 - wm('v2paplur_osp') / 4, 3), elect_patriot=round(1 - wm('v2paculsup_osp') / 4, 3))
        out[name] = o
        allp = vp[vp.country_name == (pname if name != 'Turkey' else 'Turkey')]
        rows = allp[allp.v2pashname.isin(GOVERNING[name])].sort_values('year').groupby('v2pashname').tail(1)
        mm = lambda c: float(rows[c].astype(float).mean())
        gov[name] = dict(parties=list(rows.v2pashname.astype(str)), years=list(rows.year.astype(int)), econ=round(mm('v2pariglef_osp') / 6, 3),
                         social=round((mm('v2palgbt_osp') + mm('v2pagender_osp')) / 8, 3), relig=round(1 - mm('v2parelig_osp') / 4, 3),
                         patriot=round(1 - (mm('v2paculsup_osp') + mm('v2paimmig_osp')) / 8, 3), auth=round(1 - (mm('v2paplur_osp') + mm('v2paopresp_osp')) / 8, 3))
    json.dump(out, open(os.path.join(CACHE, 'vdem2025.json'), 'w'), indent=1)
    json.dump(gov, open(os.path.join(CACHE, 'govideo.json'), 'w'), indent=1)

if __name__ == '__main__':
    wpp(); vdem(); print('done: now run python3 scripts/country-data/build.py')
