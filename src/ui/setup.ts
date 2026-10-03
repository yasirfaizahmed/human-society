// The "New society" screen: pick a starting point, then adjust anything before pressing Begin.

import { AgentStore } from '../sim/agents';
import { FAITH_COLORS, normalizeScenario, type FaithGroup, type ScenarioConfig } from '../sim/config';
import { MAX_FAITHS } from '../sim/constants';
import { TEMPLATES, CATEGORY_LABELS, type ScheduledEvent } from '../sim/events';
import { PRESETS, presetScenario } from '../sim/presets';
import { compact } from '../sim/stats';
import { clear, h, numberInput, select, slider, textInput, toast, toggle } from './dom';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const f2 = (v: number) => v.toFixed(2);
const signed = (v: number) => (v > 0 ? '+' : '') + v.toFixed(2);

const SECTIONS = [
  { id: 'start', label: 'Starting point' },
  { id: 'people', label: 'Population' },
  { id: 'faith', label: 'Faith groups' },
  { id: 'minds', label: 'Personality & values' },
  { id: 'economy', label: 'Economy' },
  { id: 'state', label: 'Government' },
  { id: 'culture', label: 'Culture & trends' },
  { id: 'timeline', label: 'Scripted history' },
] as const;

export function openSetup(host: HTMLElement, initial: ScenarioConfig | null, onBegin: (s: ScenarioConfig) => void, onCancel: (() => void) | null) {
  let sc: ScenarioConfig = initial ? JSON.parse(JSON.stringify(initial)) : presetScenario('modern');
  let presetId = initial ? '' : 'modern';
  let section: (typeof SECTIONS)[number]['id'] = 'start';
  for (const ev of sc.timeline) ev.fired = false;

  const root = h('div', { class: 'setup', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Set up a new society' });
  const nav = h('nav', { class: 'setup-nav', 'aria-label': 'Setup sections' });
  const body = h('div', { class: 'setup-body' });
  const foot = h('div', { class: 'setup-foot' });
  root.append(
    h('header', { class: 'setup-head' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'New society'),
        h('h1', {}, 'Set the starting conditions'),
        h('p', { class: 'lede' }, 'Choose a starting point, then adjust anything. Every person is generated from these settings; from then on, history unfolds from their choices and the events you allow.'),
      ),
      onCancel ? h('button', { class: 'btn ghost', onclick: () => { root.remove(); onCancel(); } }, 'Back to simulation') : null,
    ),
    h('div', { class: 'setup-main' }, nav, body),
    foot,
  );
  host.append(root);

  const renderNav = () => {
    clear(nav);
    for (const s of SECTIONS) {
      nav.append(h('button', { class: 'nav-item' + (s.id === section ? ' on' : ''), 'aria-current': s.id === section ? 'step' : undefined, onclick: () => { section = s.id; renderNav(); renderBody(); } }, s.label));
    }
  };

  const renderFoot = () => {
    clear(foot);
    const n = sc.population.size;
    const mb = (n * 1.25 * AgentStore.bytesPerAgent()) / 1e6;
    const warn = n > 1_500_000 ? ' Large populations run slowly: expect a few seconds per simulated month.' : n > 400_000 ? ' Expect roughly 1–4 simulated months per second.' : '';
    foot.append(
      h('div', { class: 'foot-info' },
        h('strong', {}, `${compact(n)} people`),
        h('span', {}, ` · about ${mb < 1000 ? Math.round(mb) + ' MB' : (mb / 1000).toFixed(1) + ' GB'} of memory · starts in ${sc.society.startYear}.${warn}`),
      ),
      h('div', { class: 'foot-actions' },
        h('button', { class: 'btn ghost', onclick: () => exportJSON() }, 'Copy as JSON'),
        h('button', { class: 'btn ghost', onclick: () => importJSON() }, 'Paste JSON'),
        h('button', { class: 'btn primary', onclick: () => { root.remove(); onBegin(normalizeScenario(sc)); } }, 'Begin simulation'),
      ),
    );
  };

  const exportJSON = async () => {
    const text = JSON.stringify(sc, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      toast('Scenario copied to the clipboard.');
    } catch {
      showText(text);
    }
  };
  const showText = (text: string) => {
    const ta = h('textarea', { class: 'json', rows: 12, readonly: true }, text) as HTMLTextAreaElement;
    body.prepend(h('div', { class: 'card' }, h('p', {}, 'Copy this text to save your scenario:'), ta));
    ta.select();
  };
  const importJSON = () => {
    const ta = h('textarea', { class: 'json', rows: 10, placeholder: 'Paste a scenario JSON here' }) as HTMLTextAreaElement;
    const card = h('div', { class: 'card' },
      h('p', {}, 'Paste a scenario you saved earlier:'), ta,
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => {
        try {
          const parsed = JSON.parse(ta.value) as ScenarioConfig;
          if (!parsed.population || !parsed.society) throw new Error('missing population/society');
          sc = normalizeScenario({ ...presetScenario('custom'), ...parsed });
          presetId = '';
          renderBody(); renderFoot();
          toast('Scenario loaded.');
        } catch (e) {
          toast(`That text is not a valid scenario (${(e as Error).message}).`);
        }
      } }, 'Load scenario')),
    );
    body.prepend(card);
    ta.focus();
  };

  const sec = (title: string, intro: string, ...items: (HTMLElement | null)[]) =>
    h('section', { class: 'setup-sec' }, h('h2', {}, title), intro ? h('p', { class: 'intro' }, intro) : null, h('div', { class: 'grid2' }, ...items));

  const renderBody = () => {
    clear(body);
    const P = sc.population, S = sc.society;
    const set = () => renderFoot();
    switch (section) {
      case 'start': {
        const cards = h('div', { class: 'preset-grid' });
        for (const p of PRESETS) {
          cards.append(h('button', {
            class: 'preset' + (p.id === presetId ? ' on' : ''), 'aria-pressed': p.id === presetId ? 'true' : 'false',
            onclick: () => { const size = sc.population.size; sc = presetScenario(p.id); sc.population.size = size; presetId = p.id; renderBody(); renderFoot(); },
          }, h('span', { class: 'era' }, p.era), h('strong', {}, p.name), h('span', { class: 'desc' }, p.description)));
        }
        body.append(
          h('section', { class: 'setup-sec' }, h('h2', {}, 'Where does history begin?'), h('p', { class: 'intro' }, 'Each starting point is only a set of slider values, so you can change everything afterwards. None of them is a real country: what happens next comes from the mechanisms, not from labels.'), cards),
          sec('Name and size', '',
            textInput('Society name', S.name, (v) => { S.name = v; }),
            slider({ label: 'Population', min: 3, max: 6.6, step: 0.01, value: Math.log10(P.size), fmt: (v) => compact(Math.round(10 ** v)), help: 'Each dot is one person with a full life. Up to about 4 million in a desktop browser; 50k–300k runs fastest.', onInput: (v) => { P.size = Math.round(10 ** v); set(); } }),
            numberInput('Start year', S.startYear, 1000, 2300, 1, (v) => { S.startYear = v; set(); }, 'Sets the calendar and the medical technology available in that era.'),
            numberInput('Random seed', S.seed, 1, 999999999, 1, (v) => { S.seed = v; }, 'Same seed + same settings = the same history. Change it to see another possible future.'),
          ),
        );
        break;
      }
      case 'people':
        body.append(sec('Who lives here', 'The shape of the population at the start.',
          slider({ label: 'Age structure', min: 0, max: 1, step: 0.01, value: P.ageStructure, low: 'Ageing', high: 'Very young', help: 'A young population ("youth bulge") brings energy but also more unrest when jobs are scarce.', onInput: (v) => { P.ageStructure = v; } }),
          slider({ label: 'Living in cities', min: 0.05, max: 0.95, step: 0.01, value: P.urbanShare, fmt: pct, onInput: (v) => { P.urbanShare = v; } }),
          slider({ label: 'Number of cities', min: 1, max: 16, step: 1, value: P.cities, onInput: (v) => { P.cities = v; } }),
          slider({ label: 'Schooling of young adults', min: 0, max: 18, step: 0.5, value: P.education, fmt: (v) => `${v.toFixed(1)} yrs`, onInput: (v) => { P.education = v; } }),
          slider({ label: 'Physical health', min: 0.4, max: 0.95, step: 0.01, value: P.health, fmt: f2, onInput: (v) => { P.health = v; } }),
          slider({ label: 'Wealth inequality', min: 0.3, max: 0.95, step: 0.01, value: P.wealthInequality, fmt: f2, low: 'Equal', high: 'Few own everything', help: 'Approximate wealth Gini coefficient. Typical modern values are 0.6–0.85.', onInput: (v) => { P.wealthInequality = v; } }),
        ));
        break;
      case 'faith': {
        const list = h('div', { class: 'faith-list' });
        const redraw = () => {
          clear(list);
          P.faiths.forEach((f, idx) => list.append(faithRow(f, idx)));
          if (P.faiths.length < MAX_FAITHS) list.append(h('button', { class: 'btn ghost', onclick: () => {
            P.faiths.push({ name: `Faith ${String.fromCharCode(65 + P.faiths.length)}`, color: FAITH_COLORS[P.faiths.length % FAITH_COLORS.length], share: 0.1, religiosity: 0.6, strictness: 0.5, tolerance: 0.5 });
            redraw();
          } }, '+ Add a faith group'));
        };
        const faithRow = (f: FaithGroup, idx: number) => h('div', { class: 'faith-row' },
          h('div', { class: 'faith-top' },
            h('span', { class: 'swatch', style: `background:${f.color}` }),
            (() => { const i = h('input', { type: 'text', value: f.name, 'aria-label': 'Group name' }) as HTMLInputElement; i.addEventListener('input', () => { f.name = i.value; }); return i; })(),
            toggle('No religion (atheist / agnostic)', !!f.secular, (v) => { f.secular = v; if (v) { f.religiosity = 0.05; } redraw(); }),
            P.faiths.length > 1 ? h('button', { class: 'btn ghost small', onclick: () => { P.faiths.splice(idx, 1); redraw(); } }, 'Remove') : null,
          ),
          h('div', { class: 'grid4' },
            slider({ label: 'Share of population', min: 0, max: 1, step: 0.01, value: f.share, fmt: pct, onInput: (v) => { f.share = v; } }),
            f.secular ? null : slider({ label: 'Religiosity', min: 0, max: 1, step: 0.01, value: f.religiosity, fmt: f2, low: 'Nominal', high: 'Devout', onInput: (v) => { f.religiosity = v; } }),
            slider({ label: 'Interpretation', min: 0, max: 1, step: 0.01, value: f.strictness, fmt: f2, low: 'Flexible', high: 'Literal', onInput: (v) => { f.strictness = v; } }),
            slider({ label: 'Tolerance of others', min: 0, max: 1, step: 0.01, value: f.tolerance, fmt: f2, low: 'Hostile', high: 'Accepting', onInput: (v) => { f.tolerance = v; } }),
          ),
        );
        redraw();
        body.append(h('section', { class: 'setup-sec' },
          h('h2', {}, 'Faith groups'),
          h('p', { class: 'intro' }, 'Name the communities and set their size and character. Devotion, interpretation and tolerance are separate dials: in the model, extremism grows from grievance, humiliation, isolation and militant networks, not from piety itself. Shares are normalized automatically.'),
          list,
        ));
        break;
      }
      case 'minds':
        body.append(
          sec('Personality (Big Five)', 'Averages for the population; individuals vary around them and pass traits partly to their children.',
            slider({ label: 'Openness', min: 0.2, max: 0.8, step: 0.01, value: P.openness, fmt: f2, help: 'Curiosity, openness to new ideas and other people.', onInput: (v) => { P.openness = v; } }),
            slider({ label: 'Conscientiousness', min: 0.2, max: 0.8, step: 0.01, value: P.conscientiousness, fmt: f2, help: 'Self-discipline: affects work, savings, health and crime.', onInput: (v) => { P.conscientiousness = v; } }),
            slider({ label: 'Extraversion', min: 0.2, max: 0.8, step: 0.01, value: P.extraversion, fmt: f2, onInput: (v) => { P.extraversion = v; } }),
            slider({ label: 'Agreeableness', min: 0.2, max: 0.8, step: 0.01, value: P.agreeableness, fmt: f2, onInput: (v) => { P.agreeableness = v; } }),
            slider({ label: 'Neuroticism', min: 0.2, max: 0.8, step: 0.01, value: P.neuroticism, fmt: f2, help: 'Emotional instability: anxiety, mood swings.', onInput: (v) => { P.neuroticism = v; } }),
            slider({ label: 'Empathy', min: 0.2, max: 0.8, step: 0.01, value: P.empathy, fmt: f2, onInput: (v) => { P.empathy = v; } }),
            slider({ label: 'Aggression', min: 0.1, max: 0.8, step: 0.01, value: P.aggression, fmt: f2, onInput: (v) => { P.aggression = v; } }),
          ),
          sec('Values and trust', '',
            slider({ label: 'Social values', min: 0, max: 1, step: 0.01, value: P.socialValues, fmt: f2, low: 'Traditional', high: 'Progressive', onInput: (v) => { P.socialValues = v; } }),
            slider({ label: 'Diversity of opinion', min: 0, max: 1, step: 0.01, value: P.valueSpread, fmt: f2, low: 'Consensus', high: 'Polarized', onInput: (v) => { P.valueSpread = v; } }),
            slider({ label: 'Economic views', min: 0, max: 1, step: 0.01, value: P.economicValues, fmt: f2, low: 'Redistribute', high: 'Free market', onInput: (v) => { P.economicValues = v; } }),
            slider({ label: 'Desire for a strong leader', min: 0, max: 1, step: 0.01, value: P.authoritarianism, fmt: f2, onInput: (v) => { P.authoritarianism = v; } }),
            slider({ label: 'Nationalism', min: 0, max: 1, step: 0.01, value: P.patriotism, fmt: f2, onInput: (v) => { P.patriotism = v; } }),
            slider({ label: 'Materialism / consumerism', min: 0, max: 1, step: 0.01, value: P.materialism, fmt: f2, onInput: (v) => { P.materialism = v; } }),
            slider({ label: 'Tolerance (multiplier)', min: 0.3, max: 1.5, step: 0.01, value: P.tolerance, fmt: f2, onInput: (v) => { P.tolerance = v; } }),
            slider({ label: 'Trust in institutions', min: 0, max: 1, step: 0.01, value: P.institutionalTrust, fmt: f2, onInput: (v) => { P.institutionalTrust = v; } }),
            slider({ label: 'Trust in other people', min: 0, max: 1, step: 0.01, value: P.socialTrust, fmt: f2, onInput: (v) => { P.socialTrust = v; } }),
          ),
        );
        break;
      case 'economy':
        body.append(sec('Economy', 'Output, jobs and wages emerge from people working; these settings set the starting level and the rules.',
          slider({ label: 'GDP per person', min: Math.log10(700), max: Math.log10(90000), step: 0.01, value: Math.log10(S.gdpPerCapita), fmt: (v) => '$' + compact(10 ** v), help: 'Yearly output per person in international dollars. 1800 ≈ $1,400; a poor country today ≈ $2,000; a rich one ≈ $50,000.', onInput: (v) => { S.gdpPerCapita = Math.round(10 ** v); } }),
          slider({ label: 'Productivity growth', min: 0, max: 4, step: 0.05, value: S.techGrowth, fmt: (v) => `${v.toFixed(2)}%/yr`, help: 'Pace of technological progress before institutions and education modify it. Pre-industrial ≈ 0.1%; modern ≈ 1–2%.', onInput: (v) => { S.techGrowth = v; } }),
          slider({ label: 'Market freedom', min: 0, max: 1, step: 0.01, value: S.marketFreedom, fmt: f2, low: 'State-planned', high: 'Free market', onInput: (v) => { S.marketFreedom = v; } }),
          slider({ label: 'Average tax rate', min: 0, max: 0.6, step: 0.01, value: S.taxRate, fmt: pct, onInput: (v) => { S.taxRate = v; } }),
          slider({ label: 'Tax progressivity', min: 0, max: 1, step: 0.01, value: S.progressivity, fmt: f2, low: 'Flat', high: 'Rich pay more', onInput: (v) => { S.progressivity = v; } }),
          slider({ label: 'Welfare & pensions', min: 0, max: 1, step: 0.01, value: S.welfare, fmt: f2, onInput: (v) => { S.welfare = v; } }),
          slider({ label: 'Access to education', min: 0, max: 1, step: 0.01, value: S.eduAccess, fmt: f2, onInput: (v) => { S.eduAccess = v; } }),
          slider({ label: 'Public health spending', min: 0, max: 1, step: 0.01, value: S.healthSpend, fmt: f2, onInput: (v) => { S.healthSpend = v; } }),
        ));
        break;
      case 'state':
        body.append(
          sec('How power works', '',
            slider({ label: 'Democracy', min: 0, max: 1, step: 0.01, value: S.democracy, fmt: f2, low: 'Dictatorship', high: 'Full democracy', help: 'Above 0.45 there are free elections every few years.', onInput: (v) => { S.democracy = v; } }),
            slider({ label: 'Rule of law', min: 0, max: 1, step: 0.01, value: S.ruleOfLaw, fmt: f2, low: 'Corrupt', high: 'Clean', onInput: (v) => { S.ruleOfLaw = v; } }),
            slider({ label: 'Press freedom', min: 0, max: 1, step: 0.01, value: S.pressFreedom, fmt: f2, onInput: (v) => { S.pressFreedom = v; } }),
            slider({ label: 'Repression of dissent', min: 0, max: 1, step: 0.01, value: S.repression, fmt: f2, onInput: (v) => { S.repression = v; } }),
            slider({ label: 'Army & police loyalty', min: 0, max: 1, step: 0.01, value: S.securityLoyalty, fmt: f2, help: 'When soldiers refuse to fire on crowds, regimes fall.', onInput: (v) => { S.securityLoyalty = v; } }),
            slider({ label: 'Military strength', min: 0, max: 1, step: 0.01, value: S.military, fmt: f2, onInput: (v) => { S.military = v; } }),
            slider({ label: 'Policing', min: 0, max: 1, step: 0.01, value: S.policing, fmt: f2, onInput: (v) => { S.policing = v; } }),
            slider({ label: 'Gender equality', min: 0, max: 1, step: 0.01, value: S.genderEquality, fmt: f2, onInput: (v) => { S.genderEquality = v; } }),
            select('State and religion', [
              { value: 'neutral', label: 'Neutral (freedom of religion)' },
              { value: 'favor', label: 'Favours one faith' },
              { value: 'theocracy', label: 'Clerical rule' },
              { value: 'suppress', label: 'Suppresses religion' },
            ], S.religiousPolicy, (v) => { S.religiousPolicy = v; renderBody(); }),
            S.religiousPolicy === 'favor' || S.religiousPolicy === 'theocracy'
              ? select('Favoured faith', P.faiths.map((f, i) => ({ value: String(i), label: f.name })), String(S.favoredFaith), (v) => { S.favoredFaith = Number(v); })
              : null,
            slider({ label: 'Discrimination against minorities', min: 0, max: 1, step: 0.01, value: S.minorityBias, fmt: f2, onInput: (v) => { S.minorityBias = v; } }),
            slider({ label: 'Openness to immigrants', min: 0, max: 1, step: 0.01, value: S.immigration ?? 0.4, fmt: f2, low: 'Closed', high: 'Open', help: 'Rich, peaceful societies with jobs attract newcomers; this sets how many may come.', onInput: (v) => { S.immigration = v; } }),
            numberInput('Years between elections', S.electionYears, 2, 10, 1, (v) => { S.electionYears = v; }),
            toggle('Rulers set policy themselves', S.politicsEndogenous, (v) => { S.politicsEndogenous = v; }, 'On: elected governments and regimes move taxes, welfare, the press and repression toward their own ideology. Off: your sliders stay in charge.'),
          ),
          sec('Ideology of those in power', 'In a dictatorship this is the regime; in a democracy, the first government (later ones are elected).',
            slider({ label: 'Social', min: 0, max: 1, step: 0.01, value: S.ruling.social, fmt: f2, low: 'Traditional', high: 'Progressive', onInput: (v) => { S.ruling.social = v; } }),
            slider({ label: 'Economic', min: 0, max: 1, step: 0.01, value: S.ruling.econ, fmt: f2, low: 'Redistribute', high: 'Free market', onInput: (v) => { S.ruling.econ = v; } }),
            slider({ label: 'Authority', min: 0, max: 1, step: 0.01, value: S.ruling.auth, fmt: f2, low: 'Liberal', high: 'Authoritarian', onInput: (v) => { S.ruling.auth = v; } }),
            slider({ label: 'Religion', min: 0, max: 1, step: 0.01, value: S.ruling.relig, fmt: f2, low: 'Secular', high: 'Religious', onInput: (v) => { S.ruling.relig = v; } }),
            slider({ label: 'Nationalism', min: 0, max: 1, step: 0.01, value: S.ruling.patriot, fmt: f2, onInput: (v) => { S.ruling.patriot = v; } }),
          ),
        );
        break;
      case 'culture':
        body.append(
          sec('Social fabric', '',
            slider({ label: 'Collectivism', min: 0, max: 1, step: 0.01, value: S.collectivism, fmt: f2, low: 'Individualist', high: 'Collectivist', help: 'How much family and community approval shape choices: marriage, faith, conformity.', onInput: (v) => { S.collectivism = v; } }),
            slider({ label: 'Social media use', min: 0, max: 1, step: 0.01, value: S.socialMedia, fmt: pct, help: 'Makes protests visible and mobilization easy, but deepens echo chambers.', onInput: (v) => { S.socialMedia = v; } }),
          ),
          sec('Trends pushed by media, schools, advertising and the state', 'Sustained pressure in one direction. Zero means no push.',
            ...([
              ['consumerism', 'Consumerism', 'Frugality', 'Consumerism'],
              ['patriotism', 'Patriotism', 'Cosmopolitan', 'Patriotic'],
              ['religiosity', 'Religion', 'Secularize', 'Religious revival'],
              ['liberalism', 'Social values', 'Traditional', 'Liberal'],
              ['capitalism', 'Economy', 'Socialist', 'Capitalist'],
              ['authority', 'Authority', 'Question authority', 'Obey authority'],
              ['tolerance', 'Tolerance', 'Suspicion of others', 'Acceptance of others'],
            ] as const).map(([k, label, lo, hi]) => slider({ label, min: -1, max: 1, step: 0.05, value: S.trends[k], fmt: signed, low: lo, high: hi, onInput: (v) => { S.trends[k] = v; } })),
          ),
          sec('Randomness', '',
            toggle('Random events', S.randomEvents, (v) => { S.randomEvents = v; }, 'Recessions, pandemics, disasters, coups and influential people arise by chance, more often when conditions favour them.'),
            slider({ label: 'Event frequency', min: 0.1, max: 3, step: 0.1, value: S.eventRate, fmt: (v) => `${v.toFixed(1)}×`, onInput: (v) => { S.eventRate = v; } }),
          ),
        );
        break;
      case 'timeline':
        body.append(timelineEditor(sc, () => renderBody()));
        break;
    }
  };

  renderNav();
  renderBody();
  renderFoot();
}

function timelineEditor(sc: ScenarioConfig, rerender: () => void): HTMLElement {
  const S = sc.society;
  const list = h('div', { class: 'tl-list' });
  if (!sc.timeline.length) list.append(h('p', { class: 'empty' }, 'No scripted events yet. Add one below, or leave history to chance.'));
  for (const ev of [...sc.timeline].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))) {
    const tpl = TEMPLATES.find((t) => t.id === ev.templateId);
    list.append(h('div', { class: 'tl-item' },
      h('span', { class: 'tl-date' }, `${ev.year}`),
      h('span', { class: 'tl-name' }, tpl?.name ?? ev.custom?.name ?? ev.templateId, ev.target?.faith !== undefined ? ` · ${sc.population.faiths[ev.target.faith]?.name ?? ''}` : ''),
      h('span', { class: 'tl-int' }, `×${ev.intensity.toFixed(1)}`),
      h('button', { class: 'btn ghost small', onclick: () => { sc.timeline = sc.timeline.filter((x) => x !== ev); rerender(); } }, 'Remove'),
    ));
  }
  const draft: ScheduledEvent = { uid: `u${Date.now()}`, templateId: 'depression', year: S.startYear + 5, month: 0, intensity: 1 };
  const opts = Object.entries(CATEGORY_LABELS).flatMap(([cat, label]) => TEMPLATES.filter((t) => t.category === cat).map((t) => ({ value: t.id, label: `${label} — ${t.name}` })));
  const desc = h('p', { class: 'help' }, TEMPLATES.find((t) => t.id === draft.templateId)!.description);
  let faithTarget = '';
  const add = h('div', { class: 'card tl-add' },
    h('h3', {}, 'Add an event'),
    h('div', { class: 'grid2' },
      select('Event', opts, draft.templateId, (v) => { draft.templateId = v; desc.textContent = TEMPLATES.find((t) => t.id === v)!.description; }),
      numberInput('Year', draft.year, S.startYear, S.startYear + 500, 1, (v) => { draft.year = v; }),
      slider({ label: 'Intensity', min: 0.2, max: 2, step: 0.1, value: 1, fmt: (v) => `${v.toFixed(1)}×`, help: '1× ≈ the historical episode it is based on.', onInput: (v) => { draft.intensity = v; } }),
      select('Aimed at', [{ value: '', label: 'Default target' }, ...sc.population.faiths.map((f, i) => ({ value: String(i), label: f.name }))], '', (v) => { faithTarget = v; }),
    ),
    desc,
    h('button', { class: 'btn primary', onclick: () => {
      const ev: ScheduledEvent = { ...draft, uid: `u${Date.now()}${Math.random().toString(36).slice(2, 6)}` };
      if (faithTarget !== '') ev.target = { faith: Number(faithTarget) };
      sc.timeline.push(ev);
      rerender();
    } }, 'Add to timeline'),
  );
  return h('section', { class: 'setup-sec' },
    h('h2', {}, 'Scripted history'),
    h('p', { class: 'intro' }, 'Schedule events in advance to steer the story: a depression in year 5, a charismatic leader in year 10, a pandemic in year 20. You can also trigger or schedule events while the simulation runs.'),
    list, add,
  );
}
